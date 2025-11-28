import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { UserStatus } from './types';

// Initialize auth - see https://theoephraim.github.io/node-google-spreadsheet/#/guides/authentication
const serviceAccountAuth = new JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
  ],
});

const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID || '', serviceAccountAuth);

export async function initSheet() {
  if (!process.env.GOOGLE_SHEET_ID) {
    console.warn('GOOGLE_SHEET_ID is not defined');
    return null;
  }
  
  try {
    await doc.loadInfo();
    return doc;
  } catch (error) {
    console.error('Error loading Google Sheet:', error);
    return null;
  }
}

export async function updateUserStatus(status: UserStatus) {
  const doc = await initSheet();
  if (!doc) return false;

  let sheet = doc.sheetsByTitle['Status'];
  if (!sheet) {
    sheet = await doc.addSheet({ headerValues: Object.keys(status), title: 'Status' });
  }

  const rows = await sheet.getRows();
  const existingRow = rows.find(row => row.get('deviceId') === status.deviceId);

  const rowData = {
    ...status,
    timestamp: new Date().toISOString(),
    lastUpdated: new Date().toLocaleString()
  };

  if (existingRow) {
    existingRow.assign(rowData);
    await existingRow.save();
  } else {
    await sheet.addRow(rowData);
  }
  
  return true;
}

export async function getAllStatuses(): Promise<UserStatus[]> {
  const doc = await initSheet();
  if (!doc) return [];

  const sheet = doc.sheetsByTitle['Status'];
  if (!sheet) return [];

  const rows = await sheet.getRows();
  return rows.map(row => ({
    deviceId: row.get('deviceId'),
    timestamp: row.get('timestamp'),
    latitude: parseFloat(row.get('latitude')),
    longitude: parseFloat(row.get('longitude')),
    batteryLevel: parseInt(row.get('batteryLevel')),
    isCharging: row.get('isCharging') === 'true',
    steps: parseInt(row.get('steps')),
    heartRate: parseInt(row.get('heartRate')),
    status: row.get('status') as any,
    lastUpdated: row.get('lastUpdated')
  }));
}
