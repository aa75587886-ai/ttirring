const express = require('express');
const cors = require('cors');
const YAML = require('yamljs');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(cors());
app.use(express.json());

// 문서(스웨거) 연결: http://localhost:3000/docs
const openapi = YAML.load('./api/ttirring_openapi_v0.1.yaml');
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

// 테스트용 목 엔드포인트
app.post('/v1/dispatch/soft', (req, res) =>
  res.status(202).json({ ok: true, received: 'soft-dispatch', body: req.body })
);
app.post('/v1/dispatch/response', (req, res) =>
  res.status(200).json({ ok: true, received: 'dispatch-response', body: req.body })
);
app.post('/v1/reservations', (req, res) =>
  res.status(201).json({ ok: true, reserved: true, body: req.body })
);
app.delete('/v1/reservations/:job_id', (req, res) => res.status(204).send());
app.get('/v1/channels/:channel_id/candidates', (req, res) =>
  res.json({
    items: [
      { callsign: 33, state: 'IDLE', eta_sec: 300, distance_m: 1200, rating: 4.9, qualified: ['DAERI'], finance_ok: true, gps_fresh_sec: 60 },
      { callsign: 21, state: 'IN_RIDE', eta_sec: 0, distance_m: 0, rating: 4.6, qualified: [], finance_ok: true, gps_fresh_sec: 80 }
    ]
  })
);
app.get('/health', (_, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Ttirring mock API on http://localhost:${port} (docs: /docs)`));
