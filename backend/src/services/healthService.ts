export interface HealthStatus {
  status: 'ok';
}

export const healthService = {
  getStatus(): HealthStatus {
    return { status: 'ok' };
  },
};
