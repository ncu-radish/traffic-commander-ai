"""
SOP Retriever — RAG pipeline for emergency traffic SOP document.

Reads the SOP text file, chunks it by article, creates embeddings,
and provides a query interface for relevant SOP clause retrieval.

Falls back to simple keyword search if ChromaDB/sentence-transformers
are not available (to keep the system running during dev).
"""
from pathlib import Path
from typing import List
import re

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
SOP_PATH = BASE_DIR / "data" / "emergency_traffic_sop.txt"


class SOPRetriever:
    def __init__(self):
        self._chunks: List[str] = []
        self._vectordb = None
        self._use_vector = False
        self._load_sop()

    def _load_sop(self):
        """Load and chunk SOP by article."""
        if not SOP_PATH.exists():
            return

        with open(SOP_PATH, "r", encoding="utf-8") as f:
            content = f.read()

        # Split by article headers (第X條, Article X, or numbered headers)
        # Try to split on patterns like "第 1 條" or "第一條" or "## Article"
        parts = re.split(r"(?=第\s*\d+\s*條|第[一二三四五六七八九十]+條)", content)
        self._chunks = [p.strip() for p in parts if p.strip() and len(p.strip()) > 20]

        # If regex didn't split well, fall back to paragraph-based chunking
        if len(self._chunks) <= 1:
            paragraphs = content.split("\n\n")
            self._chunks = [p.strip() for p in paragraphs if p.strip() and len(p.strip()) > 20]

        # Try to initialize vector DB
        try:
            self._init_vectordb()
        except Exception:
            # Fall back to keyword search
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
        Uses vector search if available, falls back to keyword matching.
        """
        if self._use_vector and self._vectordb:
            try:
                results = self._vectordb.query(
                    query_texts=[question],
                    n_results=min(top_k, len(self._chunks)),
                )
                return results["documents"][0] if results["documents"] else []
            except Exception:
                pass

        # Fallback: simple keyword matching
        return self._keyword_search(question, top_k)

    def _keyword_search(self, question: str, top_k: int) -> List[str]:
        """Simple keyword-based search fallback."""
        scored = []
        keywords = set(question)

        for chunk in self._chunks:
            score = sum(1 for kw in keywords if kw in chunk)
            if score > 0:
                scored.append((score, chunk))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [chunk for _, chunk in scored[:top_k]]

    def get_all_chunks(self) -> List[str]:
        """Return all SOP chunks for reference."""
        return self._chunks


# Singleton
sop_retriever = SOPRetriever()
