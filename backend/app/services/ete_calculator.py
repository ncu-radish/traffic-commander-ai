"""
ETE (Estimated Time to Recovery) Calculator
Implements SOP Article 7 formula.
"""
from app.models.schemas import ETEResult


# SOP Article 7: base_clearance by severity
BASE_CLEARANCE = {
    "Critical": 60,
    "High": 40,
    "Medium": 20,
}


def calculate_ete(severity: str, avg_saturation: float) -> ETEResult:
    """
    Calculate Estimated Time to Event recovery.

    Formula:
        ETE = base_clearance + congestion_penalty
        base_clearance: Critical=60, High=40, Medium=20 (minutes)
        congestion_penalty = max(0, (avg_saturation - 0.5) * 60)
    """
    base = BASE_CLEARANCE.get(severity, 20)
    penalty = max(0.0, (avg_saturation - 0.5) * 60)

    return ETEResult(
        ete_minutes=round(base + penalty, 1),
        base_clearance=base,
        congestion_penalty=round(penalty, 1),
        severity=severity,
        avg_saturation=round(avg_saturation, 3),
    )
