import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AttendanceEvent,
  AuditEntry,
  Campaign,
  CampaignAttendanceEvent,
  CampaignEvent,
  CampaignMetric,
  CampaignSession,
  Config,
  Group,
  MediaRecord,
  Meeting,
  Member,
  MemberMilestone,
  Meta,
  Rival,
  Stage,
  Week,
} from '../../domain/types';

type MediaRecordShape = MediaRecord;

const DB_NAME = 'lgtracker_local_v1';
const DB_VERSION = 2;

export interface LocalSchema extends DBSchema {
  meta: { key: string; value: Meta };
  config: { key: string; value: Config };
  stages: { key: string; value: Stage };
  groups: { key: string; value: Group };
  members: { key: string; value: Member };
  memberMilestones: { key: string; value: MemberMilestone };
  weeks: { key: string; value: Week };
  meetings: { key: string; value: Meeting; indexes: { weekId: string } };
  attendanceEvents: { key: string; value: AttendanceEvent; indexes: { meetingId: string } };
  campaigns: { key: string; value: Campaign };
  campaignSessions: { key: string; value: CampaignSession; indexes: { campaignId: string } };
  campaignAttendanceEvents: {
    key: string;
    value: CampaignAttendanceEvent;
    indexes: { campaignId: string; sessionId: string; memberId: string };
  };
  campaignMetrics: { key: string; value: CampaignMetric; indexes: { campaignId: string } };
  rivals: { key: string; value: Rival; indexes: { campaignId: string } };
  events: { key: string; value: CampaignEvent };
  media: { key: string; value: MediaRecordShape };
  audit: { key: string; value: AuditEntry };
  blobs: { key: string; value: { id: string; blob: Blob; mimeType: string } };
}

let dbPromise: Promise<IDBPDatabase<LocalSchema>> | null = null;

export function getDB(): Promise<IDBPDatabase<LocalSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<LocalSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('meta', { keyPath: 'trackerId' });
          db.createObjectStore('config', { keyPath: 'id' });
          db.createObjectStore('stages', { keyPath: 'id' });
          db.createObjectStore('groups', { keyPath: 'id' });
          db.createObjectStore('members', { keyPath: 'id' });
          db.createObjectStore('memberMilestones', { keyPath: 'id' });
          db.createObjectStore('weeks', { keyPath: 'id' });
          const meetings = db.createObjectStore('meetings', { keyPath: 'id' });
          meetings.createIndex('weekId', 'weekId');
          const attendance = db.createObjectStore('attendanceEvents', { keyPath: 'id' });
          attendance.createIndex('meetingId', 'meetingId');
          db.createObjectStore('campaigns', { keyPath: 'id' });
          const metrics = db.createObjectStore('campaignMetrics', { keyPath: 'id' });
          metrics.createIndex('campaignId', 'campaignId');
          const rivals = db.createObjectStore('rivals', { keyPath: 'id' });
          rivals.createIndex('campaignId', 'campaignId');
          db.createObjectStore('events', { keyPath: 'id' });
          db.createObjectStore('media', { keyPath: 'id' });
          db.createObjectStore('audit', { keyPath: 'id' });
          db.createObjectStore('blobs', { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          const sessions = db.createObjectStore('campaignSessions', { keyPath: 'id' });
          sessions.createIndex('campaignId', 'campaignId');
          const campaignAttendance = db.createObjectStore('campaignAttendanceEvents', { keyPath: 'id' });
          campaignAttendance.createIndex('campaignId', 'campaignId');
          campaignAttendance.createIndex('sessionId', 'sessionId');
          campaignAttendance.createIndex('memberId', 'memberId');
        }
      },
    });
  }
  return dbPromise;
}

/** Test-only: close the current connection and reset the singleton for a fresh DB. */
export async function _resetDBForTests() {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
  }
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
