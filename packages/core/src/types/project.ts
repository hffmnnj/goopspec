export interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCreate {
  name: string;
  path: string;
  description?: string;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
}
