import { apiRequest, queryClient } from "./queryClient";

export interface CreateReportResponse {
  reportId: string;
  status: string;
}

export async function createAnalysisReport(propertyInput: string): Promise<CreateReportResponse> {
  // Detect if input is a URL or an address
  const isUrl = propertyInput.includes('redfin.com') || propertyInput.includes('redf.in') || propertyInput.startsWith('http');
  
  const payload = isUrl 
    ? { inputType: 'url' as const, propertyUrl: propertyInput }
    : { inputType: 'address' as const, propertyAddress: propertyInput };
  
  const response = await apiRequest("POST", "/api/reports", payload);
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
