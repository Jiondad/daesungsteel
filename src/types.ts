/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MonthlyRecord {
  id: string; // Format: "YYYY-MM"
  year: number;
  month: number;
  diesel: number;      // L (경유)
  cityGas: number;     // Nm³ (도시가스)
  electricity: number; // kWh (구매전력)
  water: number;       // TON (수도)
  revenue: number;     // 억원 (매출액)
}

export interface EmissionFactor {
  diesel: number;      // tCO2e / L
  cityGas: number;     // tCO2e / Nm³
  electricity: number; // tCO2e / kWh
  water: number;       // tCO2e / TON (수도 - Scope 3, 전사 배출량 합계에서 제외)
}

export interface MonthlyTarget {
  diesel: number;
  cityGas: number;
  electricity: number;
  water: number;
}

export interface RoadmapTarget {
  year: number;
  target: number;      // tCO2e
  scope1?: number;
  scope2?: number;
  label: string;
}
