"""hearsay-graph: the detective's tools as an MCP server (stdio).

    python -m mcp_server.server        (from backend/)

Tools reach the village and case graphs only, never the truth graph, and never return
root_id. Every tool takes game_id; the detective agent fills it in, so an external MCP client
(Claude Desktop, an IDE) can investigate any game by id too. See app/detective/tools.py.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from mcp.server.mcpserver import MCPServer  # noqa: E402  (mcp 2.x renamed FastMCP to MCPServer)

from app.detective.tools import TOOLS  # noqa: E402

mcp = MCPServer(
    "hearsay-graph",
    instructions="Tools for solving the HEARSAY murder at the Old Mill. Start with gossip_hubs, interrogate "
                 "villagers, follow heard claims with who_told_you and interrogate(about_claim_id=...), check "
                 "find_contradictions and score_suspects, then accuse with statement ids as evidence.",
)

for fn in TOOLS:
    mcp.tool(structured_output=True)(fn)


if __name__ == "__main__":
    mcp.run()
