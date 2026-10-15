"""Build the tpl_* template graphs from backend/app/scenario/hollowmere.json.

    python scripts/seed.py

Idempotent: deletes every tpl_* graph and rebuilds all 13, then runs the 12 pre-game gossip
ticks with GAME_SEED (see backend/app/seed.py). Run it again after changing the JSON or the seed.
The backend also seeds on startup when the templates are missing (AUTO_SEED=1, the default).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.seed import seed  # noqa: E402

if __name__ == "__main__":
    seed()
