"""Read public market observations. Never substitutes sample data."""
import json
import urllib.request
import urllib.error


def get_market_observations():
    request = urllib.request.Request(
        "https://www.moltalpha.dev/api/market-intelligence",
        headers={"Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        result = json.load(response)
    if result.get("mode") != "LIVE_OBSERVATIONS_ONLY" or not isinstance(result.get("markets"), list):
        raise ValueError("Unsupported market response")
    return result


if __name__ == "__main__":
    try:
        print(json.dumps(get_market_observations(), indent=2))
    except (urllib.error.URLError, ValueError) as error:
        raise SystemExit("Market observations unavailable; no sample data substituted.") from error
