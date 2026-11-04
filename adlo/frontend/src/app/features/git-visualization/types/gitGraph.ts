export interface CommitNode {
  id: string;
  hash: string;
  shortHash?: string;
  branch: string;
  refs?: string[];
  date: string;
  message: string;
  author: string;
  authorEmail: string;
  tag?: string;
}

export interface CommitEdge {
  source: string;
  target: string;
}
