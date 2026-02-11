# Functions Test Scaffold

이 디렉터리는 태스크별 단위 테스트 스캐폴드입니다.

원칙:
- 외부 I/O(Firestore/Storage/Cloud Tasks)는 mock으로 대체
- 각 태스크의 핵심 분기만 검증
- 실패/재시도 정책은 별도 테스트에서 명시

실행:
- npm test
