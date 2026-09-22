/**
 * =========================================================================
 * Class Match - 학교 학급 보강 매칭 시스템 (Google Apps Script Backend)
 * =========================================================================
 */

/**
 * 웹앱 최초 접속 시 HTML 렌더링
 * - 구글 앱스크립트 파일명이 'Index' 또는 'index'(소문자)인 경우 모두 자동으로 감지하여 렌더링
 */
function doGet(e) {
  let template;
  // 구글 앱스크립트 편집기 파일명 대소문자 및 확장자 포함 여부 유연 탐색
  const candidateNames = ['Index', 'index', 'Index.html', 'index.html', 'INDEX', 'INDEX.html', 'main', 'Main'];
  for (let i = 0; i < candidateNames.length; i++) {
    try {
      template = HtmlService.createTemplateFromFile(candidateNames[i]);
      if (template) break;
    } catch (err) {
      // 다음 후보 시도
    }
  }

  if (!template) {
    const errorHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 2.5rem; max-width: 680px; margin: 40px auto; border: 1px solid #fecdd3; background: #fff1f2; border-radius: 12px; color: #9f1239; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
        <h2 style="margin-top: 0; color: #be123c; font-size: 1.4rem;">
          ⚠️ 'Index' HTML 파일을 찾을 수 없습니다
        </h2>
        <p style="font-size: 0.95rem; line-height: 1.7; color: #374151;">
          Google Apps Script 프로젝트 내에 <strong>Index.html</strong> 파일이 생성되어 있지 않거나, 파일명이 다르게 지정되었습니다.
        </p>
        <div style="background: #ffffff; padding: 1.25rem 1.5rem; border-radius: 8px; border: 1px solid #fda4af; margin: 1.25rem 0;">
          <h4 style="margin: 0 0 10px 0; color: #881337; font-size: 1rem;">💡 해결 방법 (30초 소요)</h4>
          <ol style="margin: 0; padding-left: 20px; font-size: 0.9rem; line-height: 1.8; color: #475569;">
            <li>Google Apps Script 편집기 좌측 [파일] 메뉴 옆의 <strong>[+]</strong> 아이콘을 클릭합니다.</li>
            <li><strong>[HTML]</strong>을 선택합니다. (※ '스크립트'가 아닌 'HTML' 선택)</li>
            <li>파일명 입력창에 확장자 없이 <strong>Index</strong> 만 입력하고 Enter를 누릅니다.</li>
            <li>생성된 파일에 <strong>Index.html</strong> 코드 전체를 복사하여 붙여넣고 <strong>저장 (Ctrl + S)</strong>합니다.</li>
            <li>우측 상단 <strong>[배포] ➔ [배포 관리] ➔ [수정(연필 아이콘)] ➔ [새 버전]</strong> 선택 후 배포합니다.</li>
          </ol>
        </div>
        <p style="font-size: 0.85rem; color: #94a3b8; margin-bottom: 0;">
          ※ 상단 [실행] 버튼으로 테스트하는 대신, 웹 앱 배포 URL로 직접 접속하시면 화면이 정상 표출됩니다.
        </p>
      </div>
    `;
    return HtmlService.createHtmlOutput(errorHtml)
      .setTitle('Class Match - 파일 설정 안내')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
  }

  // 🚀 초고속 렌더링 최적화: 서버 사이드에서 초기 데이터를 미리 로드하여 템플릿에 직접 주입
  // 브라우저 접속 즉시 2차 비동기 통신 대기 없이 0.05초 만에 테이블 표출
  try {
    const initialData = getInitialData();
    template.serverData = JSON.stringify(initialData);
  } catch (fetchErr) {
    console.warn('doGet 서버 사전 데이터 패치 예외 (클라이언트 폴백 지원):', fetchErr);
    template.serverData = JSON.stringify({ success: false, error: fetchErr.message });
  }

  return template
    .evaluate()
    .setTitle('Class Match | 교사용 학급 보강 매칭 시스템')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * HTML 내 파일 분할 인클루드 지원 함수 (대소문자 안전)
 */
function include(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (e) {
    try {
      return HtmlService.createHtmlOutputFromFile(filename.toLowerCase()).getContent();
    } catch (e2) {
      return HtmlService.createHtmlOutputFromFile(filename.charAt(0).toUpperCase() + filename.slice(1)).getContent();
    }
  }
}

/**
 * 상수 및 시트 컬럼 정의 (학급당 1행 구조)
 */
const SHEET_NAMES = {
  REQUESTS: 'Requests',
  NOTICE: '안내메세지',
  CONFIG: 'Config'
};

const DEFAULT_NOTICE = '시험 기간 전 특정 학급의 보강이 필요한 선생님이 가능 시간을 등록하고, 수업을 빌려주실 수 있는 동료 선생님과 서로 연결하여 보강을 조율하는 도구입니다.';

// 캐시 설정 (스프레드시트 접근 지연을 0.01초로 단축)
const CACHE_CONFIG = {
  KEY: 'CLASS_MATCH_INITIAL_DATA_V1',
  EXPIRATION_SEC: 600 // 10분 캐시
};

/**
 * 캐시 무효화 헬퍼 (데이터 등록/수정/삭제/매칭 시 즉시 캐시 갱신)
 */
function clearDataCache() {
  try {
    CacheService.getScriptCache().remove(CACHE_CONFIG.KEY);
  } catch (e) {
    console.warn('캐시 무효화 예외:', e);
  }
}

const REQUEST_HEADERS = [
  '희망ID',           // A (0) - 고유 희망 ID (예: REQ_123_1)
  '등록일시',         // B (1) - 2026-09-17 14:30
  '희망학급',         // C (2) - 2학년 3반 (학급마다 1행)
  '교과명',           // D (3) - 수학
  '교사명',           // E (4) - 김수학
  '내선번호',         // F (5) - 302
  '총희망차수',       // G (6) - 3
  '가능요일및교시',   // H (7) - 월(3, 5교시) | 수(2교시)
  '상태',             // I (8) - OPEN (대기중), MATCHED (매칭완료)
  '대여교사',         // J (9) - 이도덕
  '대여일시',         // K (10) - 10/2(수) 2교시
  '비고메모',         // L (11) - 시험 범위 및 진도 안내
  '게시마감일'        // M (12) - YYYY-MM-DD (마감일 경과 시 목록 미노출)
];

/**
 * 스프레드시트 인스턴스 가져오기 또는 자동 생성
 */
function getSpreadsheet() {
  const scriptProps = PropertiesService.getScriptProperties();
  let sheetId = scriptProps.getProperty('SPREADSHEET_ID');

  if (sheetId) {
    try {
      return SpreadsheetApp.openById(sheetId);
    } catch (e) {
      console.warn('저장된 스프레드시트 ID 접근 실패, 대체 확인:', e);
    }
  }

  // 바인드된 활성 시트 확인
  try {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      scriptProps.setProperty('SPREADSHEET_ID', active.getId());
      return active;
    }
  } catch (e) {
    // 바인드 시트 없음
  }

  // 신규 스프레드시트 자동 생성
  try {
    const newSheet = SpreadsheetApp.create('[Class Match] 학급 보강 매칭 데이터베이스');
    sheetId = newSheet.getId();
    scriptProps.setProperty('SPREADSHEET_ID', sheetId);
    initDatabaseSheets(newSheet, true);
    return newSheet;
  } catch (e) {
    throw new Error('스프레드시트를 생성하거나 접근할 수 없습니다: ' + e.message);
  }
}

/**
 * 데이터베이스 시트 및 기본 헤더, 샘플 데이터 초기화 (테마색 #006B67 적용)
 */
function initDatabaseSheets(spreadsheet, addSample) {
  let reqSheet = spreadsheet.getSheetByName(SHEET_NAMES.REQUESTS);
  if (!reqSheet) {
    reqSheet = spreadsheet.insertSheet(SHEET_NAMES.REQUESTS, 0);
  }
  
  // 헤더 설정
  reqSheet.getRange(1, 1, 1, REQUEST_HEADERS.length).setValues([REQUEST_HEADERS]);
  reqSheet.getRange(1, 1, 1, REQUEST_HEADERS.length)
    .setBackground('#006B67')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');
  reqSheet.setFrozenRows(1);

  // 안내메세지 시트 생성 및 초기 A1 안내 문구 설정
  let noticeSheet = spreadsheet.getSheetByName(SHEET_NAMES.NOTICE);
  if (!noticeSheet) {
    noticeSheet = spreadsheet.insertSheet(SHEET_NAMES.NOTICE);
    noticeSheet.getRange('A1').setValue(DEFAULT_NOTICE);
    noticeSheet.getRange('A1').setWrap(true);
    noticeSheet.setColumnWidth(1, 650);
  } else if (!String(noticeSheet.getRange('A1').getValue() || '').trim()) {
    noticeSheet.getRange('A1').setValue(DEFAULT_NOTICE);
  }

  // 기본 시트 삭제
  const defaultSheet = spreadsheet.getSheetByName('시트1') || spreadsheet.getSheetByName('Sheet1');
  if (defaultSheet && spreadsheet.getSheets().length > 1) {
    try {
      spreadsheet.deleteSheet(defaultSheet);
    } catch (e) {}
  }

  // 샘플 데이터 삽입 (학급당 1행 구조, 차수가 3이어도 하나의 학급이면 1행에 표시)
  if (addSample && reqSheet.getLastRow() <= 1) {
    const time1 = formatDate(new Date(Date.now() - 3600000 * 24));
    const time2 = formatDate(new Date(Date.now() - 3600000 * 8));
    const sampleDeadline = formatDateOnly(new Date(Date.now() + 3600000 * 24 * 10)); // 10일 뒤 마감
    const sampleRows = [
      [
        'REQ_SAMPLE_1', time1,
        '2학년 3반', '수학', '김수학', '302',
        3, '월(3, 5교시) | 수(2교시) | 금(4교시)',
        'OPEN', '', '', '중간고사 이차함수 시험범위 진도 완료용',
        sampleDeadline
      ],
      [
        'REQ_SAMPLE_2', time1,
        '2학년 4반', '수학', '김수학', '302',
        2, '월(3, 5교시) | 금(4교시)',
        'OPEN', '', '', '중간고사 이차함수 시험범위 진도 완료용',
        sampleDeadline
      ],
      [
        'REQ_SAMPLE_3', time2,
        '1학년 2반', '영어', '박영어', '205',
        1, '화(4교시) | 목(1, 3교시)',
        'MATCHED', '이도덕', '10/1(화) 4교시', '듣기평가 대비 수업 1차시',
        sampleDeadline
      ],
      [
        'REQ_SAMPLE_4', time2,
        '3학년 1반', '통합사회', '최사회', '412',
        2, '수(3, 4교시) | 금(2, 5교시)',
        'OPEN', '', '', '단원 정리 및 수행평가 피드백',
        sampleDeadline
      ]
    ];
    reqSheet.getRange(2, 1, sampleRows.length, REQUEST_HEADERS.length).setValues(sampleRows);
  }
}

/**
 * 초기 데이터 조회 API (CacheService 인메모리 캐시 적용)
 * @param {boolean} [forceRefresh=false] - true 전달 시 캐시를 건너뛰고 시트에서 직접 최신 데이터 조회
 */
function getInitialData(forceRefresh) {
  // 1. 캐시 적중 여부 확인 (강제 새로고침이 아닌 경우 10ms 초고속 반환)
  if (!forceRefresh) {
    try {
      const cachedStr = CacheService.getScriptCache().get(CACHE_CONFIG.KEY);
      if (cachedStr) {
        return JSON.parse(cachedStr);
      }
    } catch (cacheReadErr) {
      console.warn('캐시 조회 예외, 시트 직접 조회로 폴백:', cacheReadErr);
    }
  }

  try {
    const ss = getSpreadsheet();
    let reqSheet = ss.getSheetByName(SHEET_NAMES.REQUESTS);
    if (!reqSheet) {
      initDatabaseSheets(ss, true);
      reqSheet = ss.getSheetByName(SHEET_NAMES.REQUESTS);
    }

    // 기존 시트에 게시마감일 컬럼이 누락되어 있다면 헤더 동기화
    if (reqSheet.getLastColumn() < REQUEST_HEADERS.length) {
      reqSheet.getRange(1, 1, 1, REQUEST_HEADERS.length).setValues([REQUEST_HEADERS]);
      reqSheet.getRange(1, 1, 1, REQUEST_HEADERS.length)
        .setBackground('#006B67')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold');
    }

    const lastRow = reqSheet.getLastRow();
    let requests = [];

    if (lastRow > 1) {
      const values = reqSheet.getRange(2, 1, lastRow - 1, REQUEST_HEADERS.length).getValues();
      requests = values.map(row => ({
        id: String(row[0] || ''),
        createdAt: String(row[1] || ''),
        targetClass: String(row[2] || ''),
        subject: String(row[3] || ''),
        teacherName: String(row[4] || ''),
        extensionNumber: String(row[5] || ''),
        totalHours: Number(row[6] || 1),
        availableSchedule: String(row[7] || ''),
        status: String(row[8] || 'OPEN'), // OPEN (대기중), MATCHED (매칭완료)
        matchedTeacher: String(row[9] || ''),
        matchedDate: String(row[10] || ''),
        notes: String(row[11] || ''),
        deadline: formatDateOnly(row[12]) // M열 (12): 게시 마감일
      }));

      // 최신 등록 순 정렬
      requests.reverse();
    }

    // 구글 스프레드시트의 '안내메세지' 시트 A1 셀 내용 조회
    let noticeSheet = ss.getSheetByName(SHEET_NAMES.NOTICE);
    let noticeMessage = '';
    if (!noticeSheet) {
      noticeSheet = ss.insertSheet(SHEET_NAMES.NOTICE);
      noticeSheet.getRange('A1').setValue(DEFAULT_NOTICE);
      noticeSheet.getRange('A1').setWrap(true);
      noticeSheet.setColumnWidth(1, 650);
      noticeMessage = DEFAULT_NOTICE;
    } else {
      noticeMessage = String(noticeSheet.getRange('A1').getValue() || '').trim();
      if (!noticeMessage) {
        noticeMessage = DEFAULT_NOTICE;
        noticeSheet.getRange('A1').setValue(DEFAULT_NOTICE);
      }
    }

    const result = {
      success: true,
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      noticeMessage: noticeMessage,
      requests: requests,
      config: {
        schoolName: '행복고등학교'
      }
    };

    // 2. 캐시 저장 (단일 키 100KB 제한 감안, 10분 보관)
    try {
      const jsonStr = JSON.stringify(result);
      if (jsonStr.length < 95000) {
        CacheService.getScriptCache().put(CACHE_CONFIG.KEY, jsonStr, CACHE_CONFIG.EXPIRATION_SEC);
      }
    } catch (cachePutErr) {
      console.warn('캐시 저장 예외:', cachePutErr);
    }

    return result;
  } catch (error) {
    console.error('getInitialData 오류:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 신규 보강 희망 등록 API
 * - 희망 학급 복수 선택 지원: 선택된 학급마다 1행씩 등록 (총 차수가 3이어도 하나의 학급이면 1행에 표시)
 */
function createRequest(data) {
  try {
    if (!data.classes || !Array.isArray(data.classes) || data.classes.length === 0) {
      throw new Error('희망 학급을 최소 1개 이상 선택해 주세요.');
    }
    if (!data.subject || !data.teacherName || !data.extensionNumber) {
      throw new Error('필수 정보(교과명, 교사명, 내선번호)가 누락되었습니다.');
    }
    if (!data.deadline) {
      throw new Error('게시 마감일을 입력해 주세요.');
    }

    const totalHours = Math.max(1, parseInt(data.totalHours, 10) || 1);
    const deadlineStr = formatDateOnly(data.deadline);
    const ss = getSpreadsheet();
    const reqSheet = ss.getSheetByName(SHEET_NAMES.REQUESTS);
    if (!reqSheet) {
      initDatabaseSheets(ss, false);
    }

    const nowStr = formatDate(new Date());
    const baseId = 'REQ_' + Date.now();
    const newRows = [];
    const createdItems = [];

    // 선택된 학급 목록 순회하여 학급당 1행 생성
    data.classes.forEach((clsName, idx) => {
      const rowId = `${baseId}_${idx + 1}`;
      const rowData = [
        rowId,
        nowStr,
        String(clsName),
        String(data.subject),
        String(data.teacherName),
        String(data.extensionNumber),
        totalHours,
        String(data.availableSchedule || ''),
        'OPEN', // 초기 상태: 대기중
        '', '',
        String(data.notes || ''),
        deadlineStr // M열 (12): 게시 마감일
      ];

      newRows.push(rowData);
      createdItems.push({
        id: rowId,
        createdAt: nowStr,
        targetClass: String(clsName),
        subject: String(data.subject),
        teacherName: String(data.teacherName),
        extensionNumber: String(data.extensionNumber),
        totalHours: totalHours,
        availableSchedule: String(data.availableSchedule || ''),
        status: 'OPEN',
        matchedTeacher: '',
        matchedDate: '',
        notes: String(data.notes || ''),
        deadline: deadlineStr
      });
    });

    // 시트에 일괄 삽입
    const startRow = reqSheet.getLastRow() + 1;
    reqSheet.getRange(startRow, 1, newRows.length, REQUEST_HEADERS.length).setValues(newRows);

    // 캐시 무효화 (다음 조회 시 즉시 최신 데이터 반영)
    clearDataCache();

    return {
      success: true,
      message: `총 ${data.classes.length}개 학급의 보강 희망이 등록되었습니다.`,
      items: createdItems
    };
  } catch (error) {
    console.error('createRequest 오류:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 보강 희망 수정 API (총 차수, 가능 요일/교시, 내선번호, 메모, 마감일, 상태 등 수정)
 */
function updateRequest(data) {
  try {
    if (!data.requestId) {
      throw new Error('수정할 희망 ID가 누락되었습니다.');
    }

    const ss = getSpreadsheet();
    const reqSheet = ss.getSheetByName(SHEET_NAMES.REQUESTS);
    const lastRow = reqSheet.getLastRow();

    if (lastRow <= 1) throw new Error('데이터를 찾을 수 없습니다.');

    const ids = reqSheet.getRange(2, 1, lastRow - 1, 1).getValues().map(r => String(r[0]));
    const targetIdx = ids.indexOf(String(data.requestId));

    if (targetIdx === -1) throw new Error('해당 보강 희망 내역을 찾을 수 없습니다.');

    const rowNum = targetIdx + 2;

    // 업데이트할 항목 매핑
    // F열: 내선번호(6열), G열: 총희망차수(7열), H열: 가능요일및교시(8열), I열: 상태(9열), J열: 대여교사(10열), K열: 대여일시(11열), L열: 비고(12열), M열: 게시마감일(13열)
    if (data.extensionNumber !== undefined) reqSheet.getRange(rowNum, 6).setValue(String(data.extensionNumber));
    if (data.totalHours !== undefined) reqSheet.getRange(rowNum, 7).setValue(Number(data.totalHours));
    if (data.availableSchedule !== undefined) reqSheet.getRange(rowNum, 8).setValue(String(data.availableSchedule));
    if (data.status !== undefined) reqSheet.getRange(rowNum, 9).setValue(String(data.status));
    if (data.matchedTeacher !== undefined) reqSheet.getRange(rowNum, 10).setValue(String(data.matchedTeacher));
    if (data.matchedDate !== undefined) reqSheet.getRange(rowNum, 11).setValue(String(data.matchedDate));
    if (data.notes !== undefined) reqSheet.getRange(rowNum, 12).setValue(String(data.notes));
    if (data.deadline !== undefined) reqSheet.getRange(rowNum, 13).setValue(formatDateOnly(data.deadline));

    // 캐시 무효화 (수정 사항 즉시 반영)
    clearDataCache();

    return {
      success: true,
      message: '보강 희망 내용이 성공적으로 수정되었습니다.'
    };
  } catch (error) {
    console.error('updateRequest 오류:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 매칭 성사 확인/등록 API
 */
function confirmMatch(data) {
  try {
    if (!data.requestId) {
      throw new Error('대상 희망 ID가 누락되었습니다.');
    }

    const ss = getSpreadsheet();
    const reqSheet = ss.getSheetByName(SHEET_NAMES.REQUESTS);
    const lastRow = reqSheet.getLastRow();

    if (lastRow <= 1) throw new Error('희망 데이터를 찾을 수 없습니다.');

    const ids = reqSheet.getRange(2, 1, lastRow - 1, 1).getValues().map(r => String(r[0]));
    const targetIdx = ids.indexOf(String(data.requestId));

    if (targetIdx === -1) throw new Error('해당 보강 희망 내역을 찾을 수 없습니다.');

    const rowNum = targetIdx + 2;

    // 업데이트: 상태(9열: I), 대여교사(10열: J), 대여일시(11열: K)
    const updateValues = [[
      'MATCHED',
      String(data.matchedTeacher || ''),
      String(data.matchedDate || '')
    ]];

    reqSheet.getRange(rowNum, 9, 1, 3).setValues(updateValues);

    // 캐시 무효화 (매칭 완료 상태 즉시 반영)
    clearDataCache();

    return {
      success: true,
      message: '매칭 완료 처리가 성공적으로 등록되었습니다.'
    };
  } catch (error) {
    console.error('confirmMatch 오류:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 매칭 취소 및 재대기 처리 API
 */
function cancelMatch(requestId) {
  try {
    const ss = getSpreadsheet();
    const reqSheet = ss.getSheetByName(SHEET_NAMES.REQUESTS);
    const lastRow = reqSheet.getLastRow();

    if (lastRow <= 1) throw new Error('희망 데이터를 찾을 수 없습니다.');

    const ids = reqSheet.getRange(2, 1, lastRow - 1, 1).getValues().map(r => String(r[0]));
    const targetIdx = ids.indexOf(String(requestId));

    if (targetIdx === -1) throw new Error('해당 희망 내역을 찾을 수 없습니다.');

    const rowNum = targetIdx + 2;
    // 상태를 OPEN으로 되돌리고 대여교사 정보 초기화
    reqSheet.getRange(rowNum, 9).setValue('OPEN');
    reqSheet.getRange(rowNum, 10, 1, 2).clearContent();

    // 캐시 무효화 (취소 상태 즉시 반영)
    clearDataCache();

    return { success: true, message: '매칭이 취소되고 다시 [대기중] 상태로 변경되었습니다.' };
  } catch (error) {
    console.error('cancelMatch 오류:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 희망 행 삭제 API
 */
function deleteRequest(requestId) {
  try {
    const ss = getSpreadsheet();
    const reqSheet = ss.getSheetByName(SHEET_NAMES.REQUESTS);
    const lastRow = reqSheet.getLastRow();

    if (lastRow <= 1) throw new Error('희망 데이터를 찾을 수 없습니다.');

    const ids = reqSheet.getRange(2, 1, lastRow - 1, 1).getValues().map(r => String(r[0]));
    const targetIdx = ids.indexOf(String(requestId));

    if (targetIdx === -1) throw new Error('해당 희망 내역을 찾을 수 없습니다.');

    const rowNum = targetIdx + 2;
    reqSheet.deleteRow(rowNum);

    // 캐시 무효화 (삭제 내용 즉시 반영)
    clearDataCache();

    return { success: true, message: '보강 희망 내역이 정상적으로 삭제되었습니다.' };
  } catch (error) {
    console.error('deleteRequest 오류:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 안내 메세지 저장 API
 */
function updateNoticeMessage(message) {
  try {
    const text = String(message || '').trim();
    if (!text) throw new Error('안내 메세지 내용이 비어있습니다.');

    // 1. 구글 스프레드시트 '안내메세지' 시트 A1 셀에 저장
    try {
      const ss = getSpreadsheet();
      let noticeSheet = ss.getSheetByName(SHEET_NAMES.NOTICE);
      if (!noticeSheet) {
        noticeSheet = ss.insertSheet(SHEET_NAMES.NOTICE);
        noticeSheet.setColumnWidth(1, 650);
      }
      noticeSheet.getRange('A1').setValue(text);
      noticeSheet.getRange('A1').setWrap(true);
    } catch (sheetErr) {
      console.warn('안내메세지 시트 쓰기 실패, 프로퍼티에만 저장:', sheetErr);
    }

    // 2. 스크립트 프로퍼티 동시 저장 (캐시 역할)
    PropertiesService.getScriptProperties().setProperty('NOTICE_MESSAGE', text);

    // 캐시 무효화 (공지 내용 즉시 반영)
    clearDataCache();

    return { success: true, message: '안내 메세지가 저장되었습니다.', noticeMessage: text };
  } catch (error) {
    console.error('updateNoticeMessage 오류:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 스프레드시트 수동 ID 지정 연결 API
 */
function setSpreadsheetId(sheetId) {
  try {
    const trimmed = String(sheetId).trim();
    let actualId = trimmed;
    const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      actualId = match[1];
    }

    const ss = SpreadsheetApp.openById(actualId);
    initDatabaseSheets(ss, false);
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', actualId);

    // 캐시 무효화 (스프레드시트 변경 즉시 반영)
    clearDataCache();

    return {
      success: true,
      spreadsheetId: actualId,
      spreadsheetUrl: ss.getUrl(),
      message: '스프레드시트가 성공적으로 연결되었습니다.'
    };
  } catch (error) {
    return { success: false, error: '유효한 스프레드시트 ID 또는 접근 권한이 필요합니다: ' + error.message };
  }
}

/**
 * 날짜 포맷 헬퍼 (YYYY-MM-DD HH:mm)
 */
function formatDate(d) {
  if (!d) return '';
  const pad = n => (n < 10 ? '0' + n : n);
  const dateObj = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return String(d);
  const year = dateObj.getFullYear();
  const month = pad(dateObj.getMonth() + 1);
  const day = pad(dateObj.getDate());
  const hours = pad(dateObj.getHours());
  const mins = pad(dateObj.getMinutes());
  return `${year}-${month}-${day} ${hours}:${mins}`;
}

/**
 * 마감일 날짜 전용 포맷 헬퍼 (YYYY-MM-DD)
 */
function formatDateOnly(val) {
  if (!val) return '';
  const pad = n => (n < 10 ? '0' + n : n);
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    return `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())}`;
  }
  const str = String(val).trim();
  // "2026-09-25 00:00:00" 등의 경우 앞 10자리 정규식 추출
  const match = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const y = match[1];
    const m = match[2].length === 1 ? '0' + match[2] : match[2];
    const d = match[3].length === 1 ? '0' + match[3] : match[3];
    return `${y}-${m}-${d}`;
  }
  return str;
}
