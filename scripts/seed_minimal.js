// scripts/seed_minimal.js
// ✅ Prisma 스키마를 자동으로 읽어 Driver/User & Channel 모델과 PK(또는 Unique)를 찾아 upsert 합니다.
import { PrismaClient, Prisma } from "@prisma/client";
const prisma = new PrismaClient();
const dmmf = Prisma.dmmf;

// 모델 찾기 (여러 후보 중 첫 매칭)
function findModel(candidates) {
  const names = candidates.map(s => s.toLowerCase());
  return dmmf.datamodel.models.find(m => names.includes(m.name.toLowerCase())) || null;
}

// 모델 → 클라이언트 델리게이트 핸들 (User → prisma.user, Drivers → prisma.drivers)
function modelDelegate(modelName) {
  const key = modelName.charAt(0).toLowerCase() + modelName.slice(1);
  if (!prisma[key]) throw new Error(`Prisma delegate not found for model: ${modelName} (client key: ${key})`);
  return prisma[key];
}

// PK or Unique 키 선정
function pickUniqueKey(model) {
  // 1) PK
  const idField = model.fields.find(f => f.isId);
  if (idField) return idField.name;

  // 2) Unique(단일 필드) 중 하나
  const uniqueSingle = model.fields.find(f => f.isUnique);
  if (uniqueSingle) return uniqueSingle.name;

  // 3) 복합 유니크가 있다면 첫 필드 사용 (임시)
  if (model.uniqueFields && model.uniqueFields.length && model.uniqueFields[0].length) {
    return model.uniqueFields[0][0];
  }
  throw new Error(`No id/unique field found on model: ${model.name}`);
}

// 필드 존재할 때만 값 채워주는 helper
function buildCreateData(model, base) {
  const fieldNames = new Set(model.fields.map(f => f.name));
  const out = {};
  for (const [k, v] of Object.entries(base)) {
    if (fieldNames.has(k)) out[k] = v;
  }
  return out;
}

async function upsertById(model, delegate, idKey, idValue, createBase) {
  const createData = buildCreateData(model, createBase);
  const where = { [idKey]: idValue };
  await delegate.upsert({ where, create: createData, update: {} });
  return { idKey, idValue, usedCreate: createData };
}

async function main() {
  // 1) Driver/User 후보군에서 모델 찾기
  const driverModel =
    findModel(["Driver", "Drivers", "User", "Users", "DriverUser", "Account", "Accounts"]) ||
    findModel(["DriverEntity", "UserEntity"]);
  if (!driverModel) throw new Error("Driver/User 계열 모델을 찾지 못했습니다. (스키마 모델명 확인 필요)");

  const driverKey = pickUniqueKey(driverModel);
  const driverDelegate = modelDelegate(driverModel.name);

  // 2) Channel 후보군에서 모델 찾기
  const channelModel =
    findModel(["Channel", "Channels", "ChannelMaster"]) || findModel(["ServiceChannel"]);
  if (!channelModel) throw new Error("Channel 계열 모델을 찾지 못했습니다. (스키마 모델명 확인 필요)");

  const channelKey = pickUniqueKey(channelModel);
  const channelDelegate = modelDelegate(channelModel.name);

  // 3) 실제 upsert
  const DRIVER_ID = "DR-01";
  const CHANNEL_ID = "CH-02";

  // 이름/표시용 필드는 있으면 넣고, 없으면 무시 (자동 필터링)
  const driverCreateBase = { [driverKey]: DRIVER_ID, id: DRIVER_ID, driverId: DRIVER_ID, userId: DRIVER_ID, name: "Demo Driver" };
  const channelCreateBase = { [channelKey]: CHANNEL_ID, id: CHANNEL_ID, channelId: CHANNEL_ID, code: CHANNEL_ID, name: "Demo Channel" };

  const d = await upsertById(driverModel, driverDelegate, driverKey, DRIVER_ID, driverCreateBase);
  console.log(`✅ Driver/User 시드 완료: ${driverModel.name} (${d.idKey}=${d.idValue}) ->`, d.usedCreate);

  const c = await upsertById(channelModel, channelDelegate, channelKey, CHANNEL_ID, channelCreateBase);
  console.log(`✅ Channel 시드 완료: ${channelModel.name} (${c.idKey}=${c.idValue}) ->`, c.usedCreate);

  // 4) 요약
  console.log("\n[요약]");
  console.log(`- Driver/User 모델: ${driverModel.name}, 키: ${driverKey}`);
  console.log(`- Channel 모델   : ${channelModel.name}, 키: ${channelKey}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error("❌ 시드 중 오류:", e?.message || e);
    return prisma.$disconnect().then(() => process.exit(1));
  });
