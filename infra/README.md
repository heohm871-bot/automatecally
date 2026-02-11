# Infra Templates

기본 파일:
- cloudtasks-queues.yaml
- firestore.rules
- firestore.indexes.json

환경별 템플릿:
- environments/dev/*
- environments/staging/*
- environments/prod/*

적용 방식:
- 기본 파일을 기준으로 시작
- 환경에 맞는 템플릿으로 덮어써서 배포
