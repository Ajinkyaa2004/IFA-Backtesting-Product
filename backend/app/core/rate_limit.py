"""Global slowapi rate limiter.

Defence-in-depth alongside the nginx-level limit on /auth/login. The nginx
zone is per-IP and pretty coarse (10r/m for the whole zone); this limiter
runs inside the app and can enforce per-route caps that see the parsed
request. Kept in its own module so app.main and any router can import it
without a circular route/main dependency.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# The nginx X-Forwarded-For header is trusted (we set proxy_set_header)
# so get_remote_address returns the real client IP, not 127.0.0.1.
limiter = Limiter(key_func=get_remote_address)
