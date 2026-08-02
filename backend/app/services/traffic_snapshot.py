"""
Shared "as-of" snapshot helper for sparse time-series feeds (traffic flow,
crowd density). Originally lived only in chat.py; advisory.py filtered on an
exact timestamp instead, which silently drops every candidate whenever the
requested timestamp doesn't have a reading for that particular entity.
"""


def snapshot_at(df, ts, id_col: str = "Segment_ID"):
    """
    Latest reading per entity (segment or station) at or before `ts`.

    The data feeds are sparse — most timestamps report only a handful of
    entities — so filtering on an exact timestamp would leave the rest looking
    unreported. Timestamps use a zero-padded "YYYY-MM-DD HH:MM" format, so
    plain string comparison orders them correctly.
    """
    if df.empty or ts is None:
        return df
    subset = df[df["Timestamp"] <= ts]
    if subset.empty:
        return subset
    return subset.sort_values("Timestamp").groupby(id_col, as_index=False).tail(1)
