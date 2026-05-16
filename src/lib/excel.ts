import ExcelJS from "exceljs";

export type ExcelRow = Record<string, string | undefined>;

function cellToString(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellToString(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text).join("");
    }
    if ("hyperlink" in value && "text" in value && typeof value.text === "string") return value.text;
    return String(value);
  }
  return String(value);
}

function worksheetToRows(worksheet: ExcelJS.Worksheet) {
  const headers: string[] = [];
  const rows: ExcelRow[] = [];

  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
    headers[columnNumber] = cellToString(cell.value).trim();
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: ExcelRow = {};
    let hasValue = false;
    for (let columnNumber = 1; columnNumber < headers.length; columnNumber += 1) {
      const header = headers[columnNumber];
      if (!header) continue;
      const value = cellToString(row.getCell(columnNumber).value).trim();
      if (value) hasValue = true;
      record[header] = value || undefined;
    }
    if (hasValue) rows.push(record);
  });

  return rows;
}

export async function readExcelRowsFromBuffer(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const worksheet = workbook.worksheets[0];
  return worksheet ? worksheetToRows(worksheet) : [];
}

export async function readExcelRowsFromFile(filePath: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  return worksheet ? worksheetToRows(worksheet) : [];
}
