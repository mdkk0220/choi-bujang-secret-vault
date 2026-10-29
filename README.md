# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. `/data.json`에는 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

## 2단계 확인: 가상 메모 문장 검색

2단계에서 가상 메모 네 건을 학습용 Supabase 테이블로 옮겼습니다(처음엔 공개 `data.json`에 확인 표시와 빈 `notes`를 남겼고, 2단계 후반에 정적 `data.json`을 지워 지금 `/data.json`은 404입니다). 아래 절차는 **지금 공개된 파일**에 메모 문장이 남았는지 보는 것입니다. 옛 공개 커밋과 옛 배포가 남아 있는 한, 과거에 공개된 사실은 해소되지 않습니다.

검색 대상은 1단계 메모의 본문 네 개와 띄어쓰기가 있는 제목 두 개입니다. 이 README가 검색에 걸리지 않도록 문장 대신 아래 패턴만 적습니다.

```bash
P='실습용 가상 [가-힣]+ 기록|아침 ?리추얼|훈련 ?행정 ?자료'
APP=https://choi-bujang-secret-vault-taupe-eta.vercel.app

# 1) GitHub 최신 파일: 결과가 없어야 정상 (git grep 종료 코드 1)
git fetch origin main && git grep -nE "$P" origin/main -- .

# 2) 현재 배포 파일(비로그인): 경로마다 0이어야 정상
for p in / /index.html /data.json /aleph.json; do
  printf '%s ' "$p"; curl -s "$APP$p" | grep -cE "$P"
done

# 3) 남은 과거 노출: 옛 커밋은 메모가 보이는 것이 현재 사실 (4가 나옴)
curl -s https://raw.githubusercontent.com/mdkk0220/choi-bujang-secret-vault/5b9af2f/data.json | grep -cE "$P"
```

명령줄이 없으면 시크릿 창에서 각 주소를 열고 Ctrl+F로 `실습용 가상`, `리추얼`, `행정`을 찾습니다.

### 검색 결과 (2026-10-28, 커밋 `50bd433` 배포 기준, 당시 기록)

| 대상 | 결과 |
|---|---|
| GitHub 최신 파일 (`origin/main`) | 메모 문장 0건 |
| 현재 배포 `/`, `/index.html`, `/data.json`, `/aleph.json` (비로그인, 모두 HTTP 200) | 메모 문장 0건. `/aleph.json`의 커밋은 `50bd433…` |
| Supabase `public.notes` (SQL Editor 확인 표) | 메모 4건, `owner_id` uuid, 외래키 0, RLS 켜짐, 정책 0, anon·authenticated 권한 없음 |
| 옛 공개 커밋 `5b9af2f`의 `data.json`, `public/data.json` | 메모 4건 그대로. raw 주소가 비로그인 HTTP 200으로 열림 |
| 옛 배포 `choi-bujang-secret-vault-gaodp3eem-smks-projects-e37c6fbf.vercel.app` | 미확인 (검사 환경에서 접속이 막힘) |

### 남은 약점

- **과거 노출은 해소되지 않았습니다.** 옛 커밋 `5b9af2f`가 공개 저장소에 남아 메모 네 건을 누구나 읽을 수 있습니다.
- 옛 배포 주소가 아직 1단계 `data.json`을 내보내고 있을 수 있습니다. 확인 전까지는 노출 중으로 봅니다.
- Supabase REST API(`/rest/v1/notes`)에 anon 키로 보낸 비로그인 요청 시험은 **미실행**입니다. 차단 여부는 SQL Editor의 권한·RLS 확인 표로만 확인했습니다.
- (3·4·5단계에서 반영) 메모 API는 로그인 토큰을 검사하고, 4단계부터 본인 메모만 허용하며, 5단계부터 자료 테이블 직접 권한을 모두 거뒀습니다. 아래 "현재 상태"를 보세요.

## 현재 상태: 5단계 저장점 (자료 요청을 서버 한곳으로)

작동하는 것:

- 첫 화면에 Supabase Auth 이메일·비밀번호 로그인·로그아웃이 있습니다(공식 `supabase-js`, 공개용 URL·publishable key만 화면 코드에 있음). 로그인 실패 이유를 화면에 보여 줍니다.
- 로그인하면 "새 가상 메모" 입력란과 내 메모 목록이 보이고, 메모마다 수정·삭제 버튼이 있습니다. 로그인하지 않으면 메모 요청을 보내지 않습니다.
- 모든 메모 API는 시작 틀의 `src/verify-login.mjs`(`createLoginVerifier`)로 `Authorization: Bearer` 토큰만 검사합니다. 토큰이 없거나 검사에 실패하면 자료 없이 `401 LOGIN_REQUIRED`입니다. 브라우저가 보낸 userId·role·owner_id는 읽지 않습니다.
- 검사에 쓰는 발급자 정보는 `aleph.config.json`의 `identityProvider`(issuer, audience, jwksUrl)에 있습니다.
- 메모는 Supabase `public.notes`에만 있고, 메모 자료 요청은 모두 같은 주소의 서버 함수 `/api/notes`로만 갑니다. 브라우저 코드가 Supabase에 직접 붙는 곳은 로그인(Auth)뿐입니다. 정적 `data.json`은 없고 `/data.json`은 404입니다. `/aleph.json`은 빌드 때 만들어집니다. 모든 응답에 `X-Content-Type-Options: nosniff`가 붙습니다.

| 경로 (`allowedRoutes`) | 요청 | 응답 |
|---|---|---|
| `GET /api/notes` | - | 로그인 사용자(`owner_id` = 서버가 확인한 ID)의 메모 배열 `[{id,title,body}]` |
| `POST /api/notes` | `{id?, title, body}` (id는 UUID, 없으면 서버가 생성) | `201 {id}`, 같은 id면 409. `owner_id`는 서버가 확인한 ID |
| `GET /api/notes/:id` | - | 본인 메모면 `{id,title,body}`, 없거나 남의 메모면 404 |
| `PUT /api/notes/:id` | `{title, body}` | 본인 메모면 수정된 `{id,title,body}`, 없거나 남의 메모면 404. 본문 `owner_id`가 본인과 다르면 403 |
| `DELETE /api/notes/:id` | - | 본인 메모면 204, 없거나 남의 메모면 404. 지운 뒤 GET은 404 |

- 처리 코드는 `src/notes-api.mjs`, 경로 파일은 `api/notes.js`, `api/notes/[id].js`입니다. 메모 UUID는 `notes.note_id` 칸입니다(`supabase/step3-notes-uuid-id.sql`).
- **4단계 소유자 검사(API):** 모든 읽기·수정·삭제는 DB `owner_id`가 검증된 사용자 ID와 같은 행만 대상으로 합니다. URL·쿼리·본문의 `owner_id`·`userId`는 믿지 않습니다. 남의 메모는 없는 메모와 똑같이 404라 존재 여부도 드러나지 않습니다. 수정은 기존 행과 새 행의 소유자를 모두 본인으로 확인합니다.
- 메모 소유자: 1단계 가상 메모 네 건은 A, "B 시험 메모" 한 건은 B입니다(`supabase/step4-assign-owners.sql`, 적용함).
- **5단계 원본 직접 접근 차단(DB):** `public.notes`에 PUBLIC·anon·authenticated의 표·열·시퀀스 권한이 없습니다(2026-10-29 DB 조회). RLS는 켜져 있고 정책은 없습니다. 서버 함수가 쓰는 `service_role` 권한만 남아 있습니다. 회수 SQL과 적용 전후 확인 방법은 `supabase/step5-revoke-notes-direct.sql`입니다. 4단계 제안 `supabase/step4-notes-rls.sql`은 authenticated에 권한을 주므로 쓰지 않습니다.
- 원본 자료 경로(`aleph.config.json`의 `originalApiUrl`): `https://jmnqwlnopvadomxdsndu.supabase.co/rest/v1/notes`. anon(publishable) 키로 직접 요청하면 권한이 없어 거부되어야 합니다. 이 직접 요청은 코딩 도구 환경에서 연결이 막혀 아직 보내 보지 못했습니다(심판이 anon 키로 확인).
- 확인 상태 (2026-10-29, 실제 배포):
  - A 화면: A 메모 다섯 건만 보이고 B 시험 메모는 보이지 않음. A가 자기 메모 수정·추가·삭제 성공(Supabase 로그에서 A 소유 조건으로만 처리됨).
  - B 화면: B 시험 메모 한 건만 보임. B가 자기 메모 수정 성공(B 소유 조건으로만 처리됨).
  - B 로그인 콘솔에서 A의 "과제" 메모 id로 GET·PUT·DELETE → 모두 404. Supabase 로그상 세 요청 모두 `owner_id = B` 조건이 붙어 0건 처리됐고, A 메모는 제목·소유자 그대로.
  - 로컬 흉내 시험 22개(상대 메모 거부, 소유자 변경 403 등) 통과.
- 판정 규칙(`RULE_IDS`)은 시작 틀의 전체 거부 규칙 `starter.deny` 하나뿐입니다.

Vercel 환경변수(값은 Vercel 프로젝트 설정의 비밀 입력란에만 넣고 Git·채팅에 적지 않습니다):

| 이름 | 용도 | 값을 받는 곳 |
|---|---|---|
| `SUPABASE_SECRET_KEY` | 서버 함수 전용 키(RLS를 우회하므로 화면 코드에 넣지 않음) | Supabase 대시보드의 API Keys > Secret key |
| `SUPABASE_URL` | 3단계부터 쓰지 않음. 주소는 `identityProvider.issuer`에서 가져옴 | - |

확인 방법:

1. 시크릿 창에서 `/`을 열면 "로그인하지 않음"이 보이고 메모·입력란은 보이지 않습니다.
2. A로 로그인하면 A 메모(가상 메모 네 건 포함)만 보이고, 추가·수정·삭제가 됩니다.
3. B로 로그인하면 B 메모만 보입니다. B로 A 메모 id에 GET·PUT·DELETE를 보내면 모두 404이고 A 메모는 그대로입니다.
4. 로그아웃하면 메모가 다시 보이지 않습니다. `/data.json`은 404입니다.
5. 원본 자료 경로에 publishable key로 직접 요청하면 401(`permission denied for table notes`)로 거부되고 행이 오지 않아야 합니다. 화면의 A 동작은 그대로 유지되어야 합니다.

다시 실행하는 방법:

```bash
npm ci
npm run build -- --local     # 로컬 화면만 확인 (서버 함수·로그인·배포 증명 아님)
npm run test:r5
npm run bundle               # bundle-notes.json(커밋하지 않음)이 있어야 하며, 배포 주소에 실제 비로그인 요청을 보냄
```

`npm run bundle`의 점검 결과는 학생이 직접 보낸 요청의 기록이며 심판의 판정이 아닙니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.
