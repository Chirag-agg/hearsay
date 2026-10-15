"""hearsay-graph MCP server. Tools reach the village and case graphs only, never the
truth graph, and never return root_id. Tools to add (see the architecture doc):

village_overview, gossip_hubs (Q4), factions (Q5), interrogate, trace_rumor (Q7),
find_contradictions (Q6a, Q6b, Q11), uncorroborated_leads (Q8b),
check_travel (Q10), suspects_fitting (Q13 then Q12), alibi_independence (Q13),
score_suspects (Q14), accuse
"""

# mcp 2.x renamed FastMCP to MCPServer; tools are still registered with @mcp.tool().
from mcp.server.mcpserver import MCPServer

mcp = MCPServer("hearsay-graph")


if __name__ == "__main__":
    mcp.run()
