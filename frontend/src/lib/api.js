import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('kilolava_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('kilolava_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ============== AUTH API ==============
export const authApi = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  getMe: () => api.get('/auth/me'),
  updateMe: (data) => api.put('/auth/me', data),
};

// ============== CLIENTS API ==============
export const clientsApi = {
  getAll: (params = {}) => api.get('/clients', { params }),
  getOne: (id) => api.get(`/clients/${id}`),
  create: (data) => api.post('/clients', data),
  update: (id, data) => api.put(`/clients/${id}`, data),
  delete: (id) => api.delete(`/clients/${id}`),
};

// ============== STRUCTURES API ==============
export const structuresApi = {
  getAll: (params = {}) => api.get('/structures', { params }),
  getOne: (id) => api.get(`/structures/${id}`),
  create: (data) => api.post('/structures', data),
  update: (id, data) => api.put(`/structures/${id}`, data),
  delete: (id) => api.delete(`/structures/${id}`),
};

// ============== UNITS API ==============
export const unitsApi = {
  getAll: (params = {}) => api.get('/units', { params }),
  getOne: (id) => api.get(`/units/${id}`),
  create: (data) => api.post('/units', data),
  update: (id, data) => api.put(`/units/${id}`, data),
  delete: (id) => api.delete(`/units/${id}`),
};

// ============== DASHBOARD API ==============
export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
};

// ============== EVENTS API ==============
export const eventsApi = {
  getAll: (params = {}) => api.get('/events', { params }),
  getOne: (id) => api.get(`/events/${id}`),
  create: (data) => api.post('/events', data),
  update: (id, data) => api.put(`/events/${id}`, data),
  delete: (id) => api.delete(`/events/${id}`),
  getDayStats: (date) => api.get('/events/stats/day', { params: { date } }),
};

// ============== INVENTORY API ==============
export const inventoryApi = {
  // Articles
  getArticles: (params = {}) => api.get('/inventory/articles', { params }),
  createArticle: (data) => api.post('/inventory/articles', data),
  updateArticle: (id, data) => api.put(`/inventory/articles/${id}`, data),
  deleteArticle: (id) => api.delete(`/inventory/articles/${id}`),
  // Movements
  getMovements: (params = {}) => api.get('/inventory/movements', { params }),
  createMovement: (data) => api.post('/inventory/movements', data),
  deleteMovement: (id) => api.delete(`/inventory/movements/${id}`),
  // Register
  getRegister: (params) => api.get('/inventory/register', { params }),
  // Kit calculator
  getKitCalc: (unitId) => api.get(`/inventory/kit-calc/${unitId}`),
  // Pricing
  getPricing: (params = {}) => api.get('/inventory/pricing', { params }),
  createPricing: (data) => api.post('/inventory/pricing', data),
  deletePricing: (id) => api.delete(`/inventory/pricing/${id}`),
  // Stats
  getStats: () => api.get('/inventory/stats'),
};

// ============== LOGISTICS API ==============
export const logisticsApi = {
  // Tasks
  getTasks: (params = {}) => api.get('/logistics/tasks', { params }),
  createTask: (data) => api.post('/logistics/tasks', data),
  updateTask: (id, data) => api.put(`/logistics/tasks/${id}`, data),
  deleteTask: (id) => api.delete(`/logistics/tasks/${id}`),
  assignTask: (id, data) => api.put(`/logistics/tasks/${id}/assign`, data),
  updateStatus: (id, data) => api.put(`/logistics/tasks/${id}/status`, data),
  uploadPhoto: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/logistics/tasks/${id}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  reorder: (items) => api.put('/logistics/reorder', { items }),
  // Day summary
  getDaySummary: (date) => api.get('/logistics/day-summary', { params: { date } }),
  // Rider's tasks
  getMyTasks: (date) => api.get('/logistics/my-tasks', { params: { date } }),
  // Riders
  getRiders: () => api.get('/logistics/riders'),
  createRider: (data) => api.post('/logistics/riders', data),
  updateRider: (id, data) => api.put(`/logistics/riders/${id}`, data),
  deleteRider: (id) => api.delete(`/logistics/riders/${id}`),
  // File serving
  getFileUrl: (path) => `${API_BASE}/files/${path}`,
};

// ============== PORTAL API (client-facing) ==============
export const portalApi = {
  getDashboard: () => api.get('/portal/dashboard'),
  getMyStructuresToday: () => api.get('/portal/my-structures-today'),
  getStructures: () => api.get('/portal/structures'),
  getServices: (params = {}) => api.get('/portal/services', { params }),
  getCatalog: () => api.get('/portal/catalog'),
  getDeliverySlots: (params = {}) => api.get('/portal/delivery-slots', { params }),
  createOrder: (data) => api.post('/portal/orders', data),
  getOrders: (params = {}) => api.get('/portal/orders', { params }),
  getOrder: (id) => api.get(`/portal/orders/${id}`),
  cancelOrder: (id) => api.put(`/portal/orders/${id}/cancel`),
  getReport: (params = {}) => api.get('/portal/report', { params }),
};

// ============== OPERATIONS API (manager) ==============
export const operationsApi = {
  createClientAccount: (clientId, data) => api.post(`/clients/${clientId}/create-account`, data),
  getDeliveryConfig: () => api.get('/operations/delivery-config'),
  updateDeliveryConfig: (data) => api.put('/operations/delivery-config', data),
  getClientCatalog: (clientId) => api.get(`/operations/client-catalog/${clientId}`),
  setClientCatalog: (data) => api.post('/operations/client-catalog', data),
  getOrders: (params = {}) => api.get('/operations/orders', { params }),
  updateOrderStatus: (id, data) => api.put(`/operations/orders/${id}/status`, data),
};

export const integrationsApi = {
  providers: () => api.get('/integrations/providers'),
  list: () => api.get('/integrations/channel-managers'),
  create: (data) => api.post('/integrations/channel-managers', data),
  update: (id, data) => api.put(`/integrations/channel-managers/${id}`, data),
  remove: (id) => api.delete(`/integrations/channel-managers/${id}`),
  test: (id) => api.post(`/integrations/channel-managers/${id}/test`),
  importProperties: (id) => api.post(`/integrations/channel-managers/${id}/import-properties`),
  mappings: (id) => api.get(`/integrations/channel-managers/${id}/mappings`),
  updateMapping: (mappingId, data) => api.put(`/integrations/mappings/${mappingId}`, data),
  sync: (id) => api.post(`/integrations/channel-managers/${id}/sync`),
  reservations: (params) => api.get('/integrations/reservations', { params }),
  octorateAppSettings: () => api.get('/integrations/octorate/app-settings'),
  saveOctorateAppSettings: (data) => api.put('/integrations/octorate/app-settings', data),
  octorateConnect: (id) => api.get(`/integrations/octorate/connect/${id}`),
};

export const sheetsAnagraficheApi = {
  status: () => api.get('/sheets-anagrafiche/status'),
  connectUrl: () => api.get('/sheets-anagrafiche/connect-url'),
  disconnect: () => api.post('/sheets-anagrafiche/disconnect'),
  setupImport: () => api.post('/sheets-anagrafiche/setup-import'),
  preview: () => api.post('/sheets-anagrafiche/preview'),
  applyImport: (data) => api.post('/sheets-anagrafiche/apply', data),
  cancelPreview: (id) => api.delete(`/sheets-anagrafiche/preview/${id}`),
  backup: () => api.post('/sheets-anagrafiche/backup'),
  history: () => api.get('/sheets-anagrafiche/history'),
};

export default api;
