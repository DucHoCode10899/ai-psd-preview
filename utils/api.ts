// API utility for switching between Next.js API routes and Flask backend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:5001';

export const apiCall = async (endpoint: string, options?: RequestInit) => {
  const url = API_BASE_URL ? `${API_BASE_URL}${endpoint}` : endpoint;
  
  return fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });
};

// Convenience methods for common operations
export const api = {
  get: (endpoint: string) => apiCall(endpoint, { method: 'GET' }),
  
  post: (endpoint: string, data?: Record<string, unknown> | unknown[] | object) => apiCall(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  }),
  
  put: (endpoint: string, data?: Record<string, unknown>) => apiCall(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  }),
  
  delete: (endpoint: string, data?: Record<string, unknown>) => apiCall(endpoint, {
    method: 'DELETE',
    body: data ? JSON.stringify(data) : undefined,
  }),
};

// Specific API endpoints for type safety
export const labelsApi = {
  getAll: () => api.get('/api/labels'),
  add: (label: string) => api.post('/api/labels', { label }),
  update: (oldLabel: string, newLabel: string) => api.put('/api/labels', { oldLabel, newLabel }),
  delete: (label: string) => api.delete('/api/labels', { label }),
};

export const layoutRulesApi = {
  get: () => api.get('/api/layout-rules'),
  save: (channels: object) => api.post('/api/layout-rules', { channels }),
};

export const aiTrainingApi = {
  load: () => api.get('/api/ai-training/load'),
  save: (examples: Record<string, unknown>[]) => api.post('/api/ai-training/save', examples),
  remove: (layerName: string, shouldRemove: boolean = false) => 
    api.post('/api/ai-training/remove', { layerName, shouldRemove }),
  getData: () => api.get('/api/ai-training/data'),
};

export const segmentationRulesApi = {
  get: () => api.get('/api/segmentation-rules'),
  update: (data: object) => api.post('/api/segmentation-rules', data),
};

export const labelOptionsApi = {
  get: () => api.get('/api/label-options'),
  update: (data: Record<string, unknown>) => api.post('/api/label-options', data),
}; 