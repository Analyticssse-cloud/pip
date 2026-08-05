// lib/cluster.ts — the app shows one cluster's roster per the design
// ("Pune Cluster · TL Akshay Shrivant"). Everyone who can log in sees the
// whole cluster (ARCHITECTURE.md §3); make it a per-deployment env var
// rather than hard-coding the city.
export const CLUSTER = process.env.CLUSTER_NAME ?? "Pune";
