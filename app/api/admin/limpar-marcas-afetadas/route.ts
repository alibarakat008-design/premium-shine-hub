// /api/admin/limpar-marcas-afetadas
// Remove duplicados (SKU uppercase + MLB) e errados das 17 marcas do link
// GET: mostra preview do que vai remover
// POST: executa
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// UUIDs já identificados (das 17 marcas do link)
const KNOWN_DELETE_IDS = [
  // VERIF/TESTE
  '0618196e-92af-458c-86ef-e3ccb6df97d1','91b35a18-28ff-4ac0-9213-debebce11065',
  'fb24a27a-3492-45de-81a5-7fd42da08397','8dfdeaf3-4800-46b9-afdf-a1c51bbb9f73',
  '0dda9eaa-0f06-40e8-b498-01ed85b2a28f','406bddcc-fed1-4cfa-bb8b-72b554f818f3',
  'a3c271bd-4952-4987-bf6b-c309e259501d','90de9b84-4187-4f6b-b06e-eb3e27a43846',
  '14d96bd6-ba99-40a7-a5fd-8ddefd1211b6','e93c2e65-7f81-4acb-beec-a74a1340e307',
  '65236819-ee87-420c-b051-0a3021ff39fc','cbcbb29b-0958-4e69-9e72-227ffa7d63df',
  'adc160e8-c35b-4b13-84c6-9a50d0f19732','86a4edab-3115-4a9b-bf39-4863f887c6d4',
  '010f1952-5d0f-4b4f-966b-ef954db96ce3','2aac9e2c-d6ce-4354-afb9-b02502d2fc2b',
  '1490295b-9278-443f-9f9b-ced7377c50b9','9f086c01-709e-4d67-9930-647023c5cc30',
  'a5007f17-f01d-43a2-a8e0-9791de8c03fb',
  // ERRADOS (marca errada)
  '9c24a677-61c8-4c95-aa0b-02e1ab623a08','a67002ce-aef8-4e6e-8785-cfb5cb6c0625',
  'c5412222-c4c7-43a9-b71d-3898111722cb','b5904b6a-bf9c-4820-865c-2a810b56b12f',
  '040b32a2-4751-4481-bcbb-b62f6b46857d','687eb192-92d0-41ef-ad90-f0c73dd95756',
  'b36cf4aa-d0db-40dd-b233-18f5aec5e418','8a24859b-0f9d-49f9-a761-3145a2e2a827',
  '0eb4a7bb-898a-4842-bb1f-36811deb6aa3','57fd3eed-8f0e-436a-8634-e093a7c3bdfe',
  '58e2d9d0-74bb-4bf6-9a11-c76cdd40103e','f8c34b29-f897-4014-8428-971ba0eadeef',
  '762c2d01-cfce-4800-9a2f-a8af93492f97','53cdbea7-6353-4772-806b-d391a79af122',
  'abcfaed3-9656-47ef-9b5b-8590d789e017','314fb84e-9573-419a-9c3d-6245cb32ca8b',
  '34b1e70e-9dc8-49fd-a591-06d0f042bf0d','ebc69a01-34b2-4d61-9c3b-1d758690aee4',
  'f82811ce-5d18-4855-9fe8-0f9a6d29a386','47e28526-e103-4030-800c-0b1e40914a9e',
  '6e36d165-5aca-4726-94bf-7653dfebeedc','027f2aa7-487b-4f08-b579-0b3446b14c92',
  '13b13ef4-26a1-4661-8eba-a39264239456','4d62d6c3-57e0-4d5e-8075-bb7fe82a010e',
  // DUPLICADOS UPPERCASE das 17 marcas
  'abece52f-3681-4c25-975a-9aa5cc2b8d34','889a2035-5192-4033-a87b-cf42e7bcd755',
  '786aa866-ae7b-4d51-b297-5e256297a3fc','7b083085-01cd-46ac-a096-bcfb81840ddf',
  '0a7cf879-8b5a-4245-9c02-644fbe59cc49','705ad74a-2536-4643-936d-9600ecd1b785',
  '94e6949c-92ff-4efe-bcc7-614b5bfdc785','a5113578-928d-48ed-ac62-98d3cc7a8865',
  '5c256a05-c51c-4062-ab8e-c8a1fbbd7aea','60871fd8-b4eb-468b-ad63-dcfb79faefbf',
  '1e4434b3-3cd2-4f86-83bd-2f69f64b4a3f','b6a6b776-8a35-44dd-b48f-3a6f7ee4c05b',
  'ce43ee82-e9a9-4e41-b62f-6af0fc18ec2c','0f6e2311-3efe-4874-b49a-aa69af41cf4a',
  'd7ec3bbb-1e74-4146-a1d9-d0621a5ee56c','b3a2d1df-b4da-4410-b625-ec3b5a91e25f',
  'b610b8a7-c4e7-4c3d-a924-c3d49bc150ba','7e4a9ea3-93c7-456c-ac41-5ce4eeb46be8',
  '8f37c7b5-5fc3-48ea-95fc-348e13c47f51','502a09bb-e602-4caa-8014-8be0c84cb58b',
  '0d2ca099-3d7a-4f19-b8a2-649185ef1044','dccbaa8d-112a-497c-bc2a-8b1c7b3bf44a',
  '51a7736a-dbe6-446e-ba6e-5f05c77221d5','227cee7b-d85c-4b8a-bdce-03e5ee1125bb',
  '9c9cec1f-62e9-4d07-ab8a-b127772f8694','d7e3c3f0-6e81-4395-80ff-becdacd055a9',
  '9fdc87ce-8c3a-4760-95ee-6b044338d8bc','2e05f815-da97-44c0-95c2-969b5edc14d3',
  'a2eead9b-c271-4af8-a76d-ae0d79dbc18f','5078ef69-4571-4121-8f29-ab4489008318',
  '2ef6c492-7f6f-48ec-8433-aba16ceb8cb3','d23e7474-c25b-4447-b31d-f550de4ac2e0',
  '5039bd45-0243-4f97-ba0b-01a8ece2f1d6','42c3451f-b9d8-48da-9447-2f9a2bb0a104',
  '6256504f-6ec3-422f-86bf-fd206bbf8bc5','b9945d98-8f69-46f3-8c6c-e8c2b7ef552c',
  '3a422898-d4a9-4081-9d1e-9bc440087670','af18a558-1e8c-4fb7-84dd-c004789a691a',
  'e1529b22-acc5-48d1-bc8e-d4f1ef1befde','5c635b26-6182-4623-b4a3-00ec3475f298',
  '2c862ce3-835c-4f31-a66c-5626d681e7fb','ca20e7d8-eced-44b3-8707-928812fd749a',
  '66accc1e-ee05-49ec-97f4-fb62dfa05602','799a01e2-2863-4ee6-a179-9ef0cc7ba3f4',
  'ae182448-3ed0-46ad-8b5b-49f01bcfa298','9657f1c7-e07f-42ae-be28-e47f3f384f29',
  '606865d5-90bf-425d-899c-2a704aae52ac','55cfa1ad-39e5-48f2-b5e6-2526eb654c87',
  'd68735ee-4cf5-4db6-bd2f-88cee508bcdf','f13384a4-0482-4225-bdf5-d4e8a1ac2c62',
  'ad2760e0-40d9-4ddb-90e0-2d3caacedfeb','904e9a1f-58df-428d-b23f-5eda46169904',
  'b6e990fe-cdff-4156-9888-f191d1f420ae','35242f68-ab9e-4aa7-9982-0845b63253c4',
  '49a1b60b-75bc-443a-ac07-356d3338aaac','ba3ab686-ca03-4325-a409-4262f204f7a1',
  'd21aa314-6009-460a-a4c5-d018ccf894a3','b6841b2b-3b6d-45bd-808f-62defe17c4b2',
  '05480e4b-4c13-4a76-b2ce-bc653a90bfa5','c5f63548-14c1-470e-a66f-63fe9d97c52d',
  '04427ace-cce7-41a8-9cc4-d197a1fa7107','eff166de-ad3b-423d-a9d5-1d4365145568',
  '9c62dc34-d114-4003-87e2-b4d410176073','3de837a1-a610-49e7-a9fb-3d739660cca6',
  '6ae9fdbb-1709-49d4-a76e-12271fdad74e','5ffa70ca-20bf-43c1-89a6-6f116d62a9c0',
  '8b0603e9-35e1-46d5-a3c8-da93432359e8','f3e01915-ed2f-4ac2-b96e-efa231ebf755',
  '180e4c86-19dc-49d1-98f5-940d2aceb49e','0d360418-6d53-4393-bb89-bfa8ac4fdc53',
  '5c708ba6-65f7-4648-bb89-93063a71fdf8','6da89f07-1a6f-4c5a-b9b3-c4b1784ca1be',
  'd96cc40a-dc46-4390-bdfa-e9e144c96aa4',
]

export async function GET(req: NextRequest) {
  try {
    const products = await prisma.products.findMany({
      where: { id: { in: KNOWN_DELETE_IDS } },
      select: { id: true, sku: true, nome: true, marca_id: true },
    })
    return NextResponse.json({ ok: true, total: products.length, expected: KNOWN_DELETE_IDS.length, products })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const confirm = body?.confirm === true
    if (!confirm) {
      return NextResponse.json({ ok: false, error: 'Confirme com { confirm: true }' }, { status: 400 })
    }

    let deleted = 0
    const batchSize = 50
    for (let i = 0; i < KNOWN_DELETE_IDS.length; i += batchSize) {
      const batch = KNOWN_DELETE_IDS.slice(i, i + batchSize)
      const result = await prisma.products.deleteMany({ where: { id: { in: batch } } })
      deleted += result.count
    }

    return NextResponse.json({ ok: true, deleted, total: KNOWN_DELETE_IDS.length })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
