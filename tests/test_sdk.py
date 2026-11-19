"""
Offline unit and contract tests for the MoltALPHA Public Python SDK (stdlib-only).
"""

from pathlib import Path
import sys
import unittest

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "sdk" / "python"))

from moltalpha_sdk import (  # noqa: E402
    CANONICAL_NANO_TREASURY,
    CANONICAL_SOLANA_TREASURY,
    SentinelClient,
    canonicalize_json_rfc8785,
    decimal_to_raw_units,
    raw_units_to_decimal,
    verify_witness_signature,
)
from moltalpha_sdk.market import sanitize_market_intelligence  # noqa: E402


class TestMoltAlphaPythonSdk(unittest.TestCase):
    def test_rfc8785_canonicalization_and_pure_python_ed25519(self):
        # RFC 8032 §7.1 Test Vector 1 public key (32 bytes)
        pub_hex = "302a300506032b6570032100d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"
        payload = {"b": 2, "a": 1}
        canon = canonicalize_json_rfc8785(payload)
        self.assertEqual(canon, '{"a":1,"b":2}')

        # Tampered / mismatched signature must return valid=False
        bad = verify_witness_signature(
            payload=payload,
            signature="00" * 64,
            public_key_spki_hex=pub_hex,
            algorithm="Ed25519",
        )
        self.assertFalse(bad["valid"])

    def test_market_intelligence_strips_simulated_demo_fallback(self):
        cleaned = sanitize_market_intelligence(
            {
                "ok": True,
                "timestamp": "2026-11-19T20:00:00Z",
                "tokens": {
                    "SOL": {"symbol": "SOL", "priceUsd": 142.35, "simulatedDemoFallback": {"priceUsd": 180.0}},
                    "JUP": {"symbol": "JUP", "priceUsd": None, "simulatedDemoFallback": {"priceUsd": 1.1}},
                },
            }
        )
        self.assertNotIn("simulatedDemoFallback", cleaned["tokens"]["SOL"])
        self.assertIsNone(cleaned["tokens"]["JUP"]["priceUsd"])
        self.assertNotIn("simulatedDemoFallback", cleaned["tokens"]["JUP"])

    def test_exact_integer_payment_conversions(self):
        self.assertEqual(decimal_to_raw_units("1.5", "SOL"), 1_500_000_000)
        self.assertEqual(decimal_to_raw_units("1.25", "USDC"), 1_250_000)
        self.assertEqual(decimal_to_raw_units("50", "XNO"), 50 * (10**30))
        self.assertEqual(raw_units_to_decimal(1_500_000_000, "SOL"), "1.5")
        self.assertEqual(CANONICAL_SOLANA_TREASURY, "BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx")
        self.assertEqual(
            CANONICAL_NANO_TREASURY,
            "nano_1s5ce5k7bj74sp31m3opq8xwx44stc5dgw6w8uajyg61xjg9wiaae4uby6pu",
        )

    def test_sentinel_rejects_empty_pool_address(self):
        client = SentinelClient()
        with self.assertRaises(ValueError):
            client.get_pool_history("")


if __name__ == "__main__":
    unittest.main()
