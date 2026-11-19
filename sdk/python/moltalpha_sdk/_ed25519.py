"""
Pure-Python RFC 8032 Ed25519 Signature Verification using only Python standard library (hashlib).
Enables offline Witness cryptographic signature verification in zero-dependency and `python -S` environments.
"""

import hashlib

P = (1 << 255) - 19
L = (1 << 252) + 27742317777372353535851937790883648493
D = (-121665 * pow(121666, P - 2, P)) % P
I_SQRT_MINUS_ONE = pow(2, (P - 1) // 4, P)


def _recover_x(y: int, sign: int) -> int | None:
    if y >= P:
        return None
    y2 = (y * y) % P
    x2 = ((y2 - 1) * pow(D * y2 + 1, P - 2, P)) % P
    if x2 == 0:
        return None if sign else 0
    x = pow(x2, (P + 3) // 8, P)
    if (x * x - x2) % P != 0:
        x = (x * I_SQRT_MINUS_ONE) % P
    if (x * x - x2) % P != 0:
        return None
    if (x & 1) != sign:
        x = P - x
    return x


_BY = (4 * pow(5, P - 2, P)) % P
_BX = _recover_x(_BY, 0)
BASE_POINT = (_BX % P, _BY % P, 1, (_BX * _BY) % P)
NEUTRAL_POINT = (0, 1, 1, 0)


def _point_add(pt_p: tuple[int, int, int, int], pt_q: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    x1, y1, z1, t1 = pt_p
    x2, y2, z2, t2 = pt_q
    a = ((y1 - x1) * (y2 - x2)) % P
    b = ((y1 + x1) * (y2 + x2)) % P
    c = (2 * t1 * t2 * D) % P
    d = (2 * z1 * z2) % P
    e = (b - a) % P
    f = (d - c) % P
    g = (d + c) % P
    h = (b + a) % P
    return ((e * f) % P, (g * h) % P, (f * g) % P, (e * h) % P)


def _scalar_mult(scalar: int, pt: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    result = NEUTRAL_POINT
    addend = pt
    s = scalar
    while s > 0:
        if s & 1:
            result = _point_add(result, addend)
        addend = _point_add(addend, addend)
        s >>= 1
    return result


def _point_decompress(encoded: bytes) -> tuple[int, int, int, int] | None:
    if len(encoded) != 32:
        return None
    val = int.from_bytes(encoded, "little")
    sign = (val >> 255) & 1
    y = val & ((1 << 255) - 1)
    x = _recover_x(y, sign)
    if x is None:
        return None
    return (x, y, 1, (x * y) % P)


def _point_equal(pt_p: tuple[int, int, int, int], pt_q: tuple[int, int, int, int]) -> bool:
    x1, y1, z1, _ = pt_p
    x2, y2, z2, _ = pt_q
    if (x1 * z2 - x2 * z1) % P != 0:
        return False
    if (y1 * z2 - y2 * z1) % P != 0:
        return False
    return True


def verify_ed25519(public_key_32: bytes, message: bytes, signature_64: bytes) -> bool:
    """
    RFC 8032 Section 5.1.7 Ed25519 signature verification.
    """
    if not isinstance(public_key_32, (bytes, bytearray)) or len(public_key_32) != 32:
        return False
    if not isinstance(signature_64, (bytes, bytearray)) or len(signature_64) != 64:
        return False

    r_bytes = bytes(signature_64[:32])
    s_int = int.from_bytes(signature_64[32:], "little")
    if s_int >= L or s_int < 0:
        return False

    a_pt = _point_decompress(bytes(public_key_32))
    r_pt = _point_decompress(r_bytes)
    if a_pt is None or r_pt is None:
        return False

    k_digest = hashlib.sha512(r_bytes + bytes(public_key_32) + bytes(message)).digest()
    k_int = int.from_bytes(k_digest, "little") % L

    lhs = _scalar_mult(s_int, BASE_POINT)
    rhs = _point_add(r_pt, _scalar_mult(k_int, a_pt))
    return _point_equal(lhs, rhs)
