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

2단계에서 가상 메모 네 건을 학습용 Supabase 테이블로 옮기고, 공개 `data.json`에는 확인 표시와 빈 `notes`만 남겼습니다. 아래 절차는 **지금 공개된 파일**에 메모 문장이 남았는지 보는 것입니다. 옛 공개 커밋과 옛 배포가 남아 있는 한, 과거에 공개된 사실은 해소되지 않습니다.

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

### 검색 결과 (2026-10-28, 커밋 `50bd433` 배포 기준)

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
- 메모를 로그인 사용자에게 돌려주는 보호된 자료 API는 아직 없습니다. 화면 `/`은 빈 목록을 보여 주고, 빌드는 여전히 `data.json`을 `public/`에 복사하며, `aleph.config.json`의 `step`과 `src/attack-check.mjs`는 1단계 그대로입니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.
