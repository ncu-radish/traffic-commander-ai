"""
SOP Retriever — RAG pipeline for emergency traffic SOP document.

Reads the SOP text file, chunks it by article, creates embeddings,
and provides a query interface for relevant SOP clause retrieval.

Falls back to keyword search if ChromaDB/sentence-transformers
are not available (to keep the system running during dev).
"""
from pathlib import Path
from typing import List
import re

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent
SOP_PATH = BASE_DIR / "data" / "emergency_traffic_sop.txt"

# Keyword aliases to help match user queries to SOP articles
ARTICLE_KEYWORDS: dict[int, List[str]] = {
    1: ["擁塞", "壅塞", "飽和", "saturation", "A級", "B級", "癱瘓", "級別", "分級", "黃燈", "紅燈", "長綠燈"],
    2: ["車禍", "路障", "封閉", "塌陷", "替代路", "疏散", "改道", "alternatives", "主疏散", "CMS", "路段封閉"],
    3: ["捷運", "接駁", "分流", "BL17", "過站不停", "MRT", "人群", "國父紀念館"],
    4: ["大巨蛋", "散場", "DOME", "散場啟動"],
    5: ["號誌", "故障", "Power_Failure", "失效", "人工指揮", "警力"],
    6: ["多語", "漫遊", "roaming", "簡訊", "通報", "多國語言", "看板"],
    7: ["ETE", "恢復時間", "clearance", "congestion_penalty", "預計", "公式"],
}


class SOPRetriever:
    def __init__(self):
        self._chunks: List[str] = []
        self._full_content: str = ""
        self._vectordb = None
        self._use_vector = False
        self._load_sop()

    def _load_sop(self):
        """Load and chunk SOP by article using === separator blocks."""
        if not SOP_PATH.exists():
            return

        with open(SOP_PATH, "r", encoding="utf-8") as f:
            self._full_content = f.read()

        # Split by the ======== separator lines that precede each article title
        parts = re.split(r"={10,}", self._full_content)
        raw_parts = [p.strip() for p in parts if p.strip()]

        # Merge title + content pairs
        # Pattern after split: [preamble, title1, content1, title2, content2, ...]
        # Titles are short (< 30 chars), content is longer
        merged = []
        i = 0
        # Skip the document title preamble (e.g., "交通應變標準程序")
        if raw_parts and len(raw_parts[0]) < 30 and not any(c.isdigit() for c in raw_parts[0]):
            i = 1

        while i < len(raw_parts):
            current = raw_parts[i]
            # If this is a short title line and next part is content, merge them
            if len(current) < 50 and i + 1 < len(raw_parts):
                merged.append(current + "\n" + raw_parts[i + 1])
                i += 2
            else:
                merged.append(current)
                i += 1

        if merged:
            self._chunks = merged
        else:
            # Fallback to paragraph-based chunking
            paragraphs = self._full_content.split("\n\n")
            self._chunks = [p.strip() for p in paragraphs if p.strip() and len(p.strip()) > 30]

        # Try to initialize vector DB
        try:
            self._init_vectordb()
        except Exception:
            self._use_vector = False

    def _init_vectordb(self):
        """Initialize ChromaDB with sentence-transformer embeddings."""
        try:
            import chromadb
            from chromadb.utils import embedding_functions

            ef = embedding_functions.SentenceTransformerEmbeddingFunction(
                model_name="all-MiniLM-L6-v2"
            )

            client = chromadb.Client()  # In-memory for MVP
            collection = client.get_or_create_collection(
                name="sop_articles",
                embedding_function=ef,
            )

            # Only add if collection is empty
            if collection.count() == 0 and self._chunks:
                collection.add(
                    documents=self._chunks,
                    ids=[f"sop_chunk_{i}" for i in range(len(self._chunks))],
                )

            self._vectordb = collection
            self._use_vector = True
        except ImportError:
            self._use_vector = False

    def query(self, question: str, top_k: int = 3) -> List[str]:
        """
        Query relevant SOP clauses.
        Uses keyword matching first (better for Chinese), supplemented by vector search.
        """
        # Primary: keyword search (works reliably for Chinese SOP content)
        keyword_results = self._keyword_search(question, top_k)

        if keyword_results:
            return keyword_results

        # Fallback to vector search if keyword search found nothing
        if self._use_vector and self._vectordb:
            try:
                results = self._vectordb.query(
                    query_texts=[question],
                    n_results=min(top_k, len(self._chunks)),
                )
                if results["documents"] and results["documents"][0]:
                    return results["documents"][0]
            except Exception:
                pass

        # Last resort: return all chunks so the model has full SOP
        return self._chunks[:top_k]

    def _keyword_search(self, question: str, top_k: int) -> List[str]:
        """
        Keyword-based search with two strategies:
        1. Match article-level keywords from ARTICLE_KEYWORDS mapping.
        2. Tokenized word matching within chunks.
        """
        # Strategy 1: Check which SOP articles are relevant by keyword aliases
        matched_articles: set[int] = set()
        question_lower = question.lower()
        for article_num, keywords in ARTICLE_KEYWORDS.items():
            for kw in keywords:
                if kw.lower() in question_lower:
                    matched_articles.add(article_num)
                    break

        # Also detect "第X條" or article number references in the question
        article_refs = re.findall(r"第\s*(\d+)\s*條", question)
        for ref in article_refs:
            matched_articles.add(int(ref))

        # If we found specific article matches, prioritize those chunks
        if matched_articles:
            priority_chunks = []
            for chunk in self._chunks:
                for art_num in matched_articles:
                    # Check if this chunk is about that article
                    if (f"{art_num}." in chunk[:20]
                        or f"第 {art_num} 條" in chunk
                        or f"第{art_num}條" in chunk):
                        priority_chunks.append(chunk)
                        break
            if priority_chunks:
                return priority_chunks[:top_k]

        # Strategy 2: Tokenized word matching (fix for the old single-char bug)
        # Extract meaningful tokens (Chinese phrases and English words)
        tokens = re.findall(r"[\u4e00-\u9fff]{2,}|[a-zA-Z_]\w+|\d+", question)
        tokens = [t.lower() for t in tokens if len(t) >= 2]

        if not tokens:
            # If no meaningful tokens extracted, return first few chunks
            return self._chunks[:top_k]

        scored = []
        for chunk in self._chunks:
            chunk_lower = chunk.lower()
            score = sum(1 for token in tokens if token in chunk_lower)
            if score > 0:
                scored.append((score, chunk))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [chunk for _, chunk in scored[:top_k]]

    def get_all_chunks(self) -> List[str]:
        """Return all SOP chunks for reference."""
        return self._chunks

    def get_full_content(self) -> str:
        """Return the full SOP document content."""
        return self._full_content


# Singleton
sop_retriever = SOPRetriever()
