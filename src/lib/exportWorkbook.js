// 감사용 엑셀(.xlsx) 생성·다운로드. exceljs 는 내보내기를 누를 때만 불러온다(초기 로딩 속도 유지).
async function loadExcelJS() {
  const mod = await import('exceljs');
  return mod.default || mod;
}

// 시트 목록({ name, rows, widths }) → xlsx 바이너리
export async function buildWorkbookBuffer(sheets) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = '대성스틸 온실가스 인벤토리 시스템';
  wb.created = new Date();
  sheets.forEach((sheet) => {
    const ws = wb.addWorksheet(sheet.name);
    sheet.rows.forEach((row) => ws.addRow(row));
    if (sheet.widths) sheet.widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const head = ws.getRow(1);
    head.font = { bold: true };
    head.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEBE4' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF57534E' } } };
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.eachRow((row) => row.eachCell((cell) => {
      if (typeof cell.value === 'string' && cell.value.length > 60) cell.alignment = { wrapText: true, vertical: 'top' };
    }));
  });
  return wb.xlsx.writeBuffer();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadWorkbook(sheets, filename) {
  const buf = await buildWorkbookBuffer(sheets);
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

export function downloadJson(obj, filename) {
  downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), filename);
}
