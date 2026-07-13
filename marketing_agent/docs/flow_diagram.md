# System Flow Diagram (Simplified)

This diagram provides a high-level overview of the MSOA (Marketing Bot) system architecture and data flow.

```mermaid
graph LR
    %% External Nodes
    GitHub[GitHub API]
    Reddit[Reddit API]
    User((User))
    VertexAI[Vertex AI/Gemini]

    %% Core Services
    subgraph "MSOA Backend"
        Collector[Collector]
        Pipeline[Pipeline]
        LLM[LLM Service]
        Executor[Executor]
        UI[UI Backend]
        DB[(PostgreSQL)]
    end

    %% Data Flow
    GitHub --"Issues/PRs"--> Collector
    Reddit --"Posts"--> Collector
    Collector --"Save Candidates"--> DB
    
    DB --"Candidates"--> Pipeline
    Pipeline --"Opportunities"--> DB
    
    DB --"Pending Opps"--> LLM
    LLM --"Analysis & Drafts"--> VertexAI
    VertexAI --"Results"--> LLM
    LLM --"Enriched Opps"--> DB
    
    User --"Review & Approve"--> UI
    UI <--"Data Sync"--> DB
    
    DB --"Approved Actions"--> Executor
    Executor --"Post Comment"--> GitHub
```

## Core Workflow

1.  **Harvest**: Collector periodically pulls potential leads from GitHub and Reddit.
2.  **Filter**: Pipeline refines candidates by checking Author/Repo cooldowns.
3.  **Analyze**: LLM Service qualifies leads (Signal & Risk) and drafts responses.
4.  **Decide**: User reviews analysis and approves responses via Dashboard.
5.  **Act**: Executor posts the approved response back to GitHub.
