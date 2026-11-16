"""Warm the local model before accepting customer conversation (no customer data)."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.local_model import plan_turn, ModelUnavailable
from app.ordering_schemas import TurnRequest, Cart
from app.catalog import RESTAURANT_CONFIG, CATALOG
try:
    plan_turn(TurnRequest(text='Hello', cart=Cart()), RESTAURANT_CONFIG, CATALOG)
    print('Local AI warm-up complete. Subsequent conversational responses can reuse the prompt cache.')
except ModelUnavailable:
    print('Model is loading or warm-up exceeded its time budget. Verified ordering remains available.')
