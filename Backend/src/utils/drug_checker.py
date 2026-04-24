import pandas as pd
import os
from pathlib import Path
from src.utils.logger import get_logger
logger = get_logger(__name__)

# Path to the CDSCO Excel file (now inside the drug_analyzer module)
EXCEL_PATH = Path(__file__).parent.parent / "modules" / "drug_analyzer" / "CDSCO_Approved_Drugs.xlsx"

# Load the Excel file at module startup
df_cdsco = None
if EXCEL_PATH.exists():
    try:
        df_cdsco = pd.read_excel(EXCEL_PATH)
    except Exception as e:
        print(f"Error loading CDSCO Excel: {e}")
else:
    print(f"Warning: {EXCEL_PATH} not found.")

def check_drug_eligibility(drug_name: str, strength: str) -> tuple[bool, dict | None]:
    """
    Compares extracted drug info against the CDSCO approved drugs database.
    Matching logic:
    - drug_name is a substring of the row's 'Drug Name' column.
    - strength is a substring of either the row's 'Drug Name' or 'Strength' column.
    """
    global df_cdsco
    
    if df_cdsco is None:
        # Re-attempt load if it failed earlier or wasn't present
        if EXCEL_PATH.exists():
            df_cdsco = pd.read_excel(EXCEL_PATH)
        else:
            return False, None

    # Case-insensitive normalization
    drug_name_lower = drug_name.lower() if drug_name else ""
    strength_lower = strength.lower() if strength else ""

    if not drug_name_lower:
        return False, None

    # Filter by drug name first (Condition 1)
    mask_name = df_cdsco['Drug Name'].astype(str).str.lower().str.contains(drug_name_lower, regex=False)
    
    potential_matches = df_cdsco[mask_name]
    
    if potential_matches.empty:
        return False, None

    # If strength was extracted, check Condition 2
    if strength_lower:
        mask_strength_in_name = potential_matches['Drug Name'].astype(str).str.lower().str.contains(strength_lower, regex=False)
        mask_strength_in_strength = potential_matches['Strength'].astype(str).str.lower().str.contains(strength_lower, regex=False)
        
        final_matches = potential_matches[mask_strength_in_name | mask_strength_in_strength]
    else:
        # Match on drug_name only if no strength was extracted
        final_matches = potential_matches

    if not final_matches.empty:
        # Return the first match as a dict
        matched_row = final_matches.iloc[0].to_dict()
        # Convert NaN values to None for JSON serialization
        matched_row = {k: (v if pd.notna(v) else None) for k, v in matched_row.items()}
        return True, matched_row

    return False, None
