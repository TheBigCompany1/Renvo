import { apiRequest, queryClient } from "./queryClient";

export interface CreateReportResponse {
  reportId: string;
  status: string;
}

export async function createAnalysisReport(propertyUrl: string): Promise<CreateReportResponse> {
  const response = await apiRequest("POST", "/api/reports", { propertyUrl });
  return response.json();
}

export async function getAnalysisReport(reportId: string) {
  const response = await apiRequest("GET", `/api/reports/${reportId}`);
  return response.json();
}

export function invalidateReportQueries(reportId?: string) {
  if (reportId) {
    queryClient.invalidateQueries({ queryKey: ['/api/reports', reportId] });
  } else {
    queryClient.invalidateQueries({ queryKey: ['/api/reports'] });
  }
}
