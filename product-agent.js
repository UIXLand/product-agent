import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import axios from 'axios'
import express from 'express'
import cron from 'node-cron'

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const clickup = axios.create({
  baseURL: 'https://api.clickup.com/api/v2',
  headers: { Authorization: process.env.CLICKUP_API_TOKEN, 'Content-Type': 'application/json' }
})
const LIST_ID = process.env.CLICKUP_LIST_ID
const PORT = process.env.PORT || process.env.PRODUCT_AGENT_PORT || 3001

const CREATE_PROMPT = `Ты Product Agent продукта SafeButton — мобильного приложения тревожной кнопки (React Native + Supabase).
Контекст: два типа юзеров (курируемый / куратор), стек React Native + Supabase, рынок Украина + диаспора, Freemium $0/$3.99, цель MAU 2.5k / $3-5k MRR.
Верни ТОЛЬКО валидный JSON без markdown-блоков:
{"feature_name":"...","owner":"Макс","general":{"name":"...","why":"..."},"business_value":{"connection_to_goal":"...","aarrr_stage":"...","priority":7},"problem_and_solution":{"user_pain":"...","solution":"..."},"mechanics":{"input":"...","process":"...","result":"...","conditions":"...","integrations":"..."},"customer_journey":{"entry_point":"...","steps":["..."],"aha_moment":"..."},"success_metrics":{"essence":"...","events":["..."],"primary_metric":"...","secondary_metrics":["..."],"target":"..."},"visual_and_content":{"copywriting":"...","visual":"...","draft_ui":"..."},"tech_assessment":{"complexity":"Low|Medium|High","estimate":"...","dependencies":"..."},"analysis":{"target_and_value":{"user_segment":"...","value_proposition":"...","aha_moment":"..."},"market_research":{"competitors":[{"name":"...","what_they_do":"...","strong":"...","weak":"..."}],"strategy":{"copy":"...","improve":"..."}},"conclusions":{"what_we_build":"...","action_items":["..."],"our_utp":"...","mistakes_to_avoid":["..."]}},"open_questions":["..."],"out_of_scope":["..."]}`

const EDIT_PROMPT = `Ты Product Agent продукта SafeButton. Тебе дан текущий паспорт фичи и правки от продакта. Внеси правки и верни ТОЛЬКО полный обновлённый JSON паспорта без markdown-блоков.`

async function createTask(name, desc) {
  const r = await clickup.post(`/list/${LIST_ID}/task`, { name, description: desc, tags: ['passport'], status: 'to do' })
  return r.data
}
async function updateDesc(taskId, desc) { await clickup.put(`/task/${taskId}`, { description: desc }) }
async function addComment(taskId, text) { await clickup.post(`/task/${taskId}/comment`, { comment_text: text, notify_all: false }) }
async function getTask(taskId) { const r = await clickup.get(`/task/${taskId}`); return r.data }
async function getComments(taskId) { try { const r = await clickup.get(`/task/${taskId}/comment`); return r.data.comments ?? [] } catch { return [] } }

async function callClaude(system, content, maxTokens = 4000) {
  const r = await claude.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, system, messages: [{ role: 'user', content }] })
  const text = r.content[0].text.trim().replace(/^```json\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(text)
}

function buildDesc(p) {
  const competitors = p.analysis?.market_research?.competitors?.map(c => `• ${c.name}: ${c.what_they_do}\n  ✅ ${c.strong}\n  ❌ ${c.weak}`).join('\n') ?? '—'
  const steps = p.customer_journey?.steps?.map((s, i) => `${i + 1}. ${s}`).join('\n') ?? '—'
  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 ПАСПОРТ ФИЧИ | Статус: Draft
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Назва: ${p.feature_name} | Owner: ${p.owner ?? 'Макс'} | Дата: ${new Date().toLocaleDateString('ru-RU')}

1. ЗАГАЛЬНА ІНФОРМАЦІЯ
Назва: ${p.general?.name ?? p.feature_name}
Ціль (Why): ${p.general?.why ?? '—'}

2. БІЗНЕС-ЦІННІСТЬ
Зв'язок з ціллю MAU 2.5k / $3-5k: ${p.business_value?.connection_to_goal ?? '—'}
Воронка AARRR: ${p.business_value?.aarrr_stage ?? '—'}
Пріоритет: ${p.business_value?.priority ?? '—'}/10

3. ПРОБЛЕМА І РІШЕННЯ
Біль юзера: ${p.problem_and_solution?.user_pain ?? '—'}
Рішення: ${p.problem_and_solution?.solution ?? '—'}

4. МЕХАНІКА І ЛОГІКА
Вхідні дані: ${p.mechanics?.input ?? '—'}
Процес: ${p.mechanics?.process ?? '—'}
Результат: ${p.mechanics?.result ?? '—'}
Умови: ${p.mechanics?.conditions ?? '—'}
Інтеграції: ${p.mechanics?.integrations ?? 'Не потрібні'}

5. ШЛЯХ ЮЗЕРА (CJM)
Точка входу: ${p.customer_journey?.entry_point ?? '—'}
Кроки:
${steps}
Aha-moment: ${p.customer_journey?.aha_moment ?? '—'}

6. МЕТРИКИ УСПІХУ
Суть: ${p.success_metrics?.essence ?? '—'}
Events: ${p.success_metrics?.events?.map(e => `• ${e}`).join('\n') ?? '—'}
Primary Metric: ${p.success_metrics?.primary_metric ?? '—'}
Secondary: ${p.success_metrics?.secondary_metrics?.join(', ') ?? '—'}
Target: ${p.success_metrics?.target ?? '—'}

7. ВІЗУАЛЬНІ НАПРАЦЮВАННЯ
Copywriting: ${p.visual_and_content?.copywriting ?? '—'}
Візуал: ${p.visual_and_content?.visual ?? '—'}
Драфт UI: ${p.visual_and_content?.draft_ui ?? '—'}

8. ТЕХНІЧНА ОЦІНКА
Складність: ${p.tech_assessment?.complexity ?? '—'} | Оцінка: ${p.tech_assessment?.estimate ?? '—'}
Залежності: ${p.tech_assessment?.dependencies ?? 'Немає'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
АНАЛІЗ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ЦІЛЬОВА АУДИТОРІЯ
Сегмент: ${p.analysis?.target_and_value?.user_segment ?? '—'}
Value Proposition: ${p.analysis?.target_and_value?.value_proposition ?? '—'}
Aha-moment: ${p.analysis?.target_and_value?.aha_moment ?? '—'}

АНАЛІЗ КОНКУРЕНТІВ
${competitors}
Копіюємо: ${p.analysis?.market_research?.strategy?.copy ?? '—'}
Покращуємо: ${p.analysis?.market_research?.strategy?.improve ?? '—'}

ВИСНОВКИ
Що будуємо: ${p.analysis?.conclusions?.what_we_build ?? '—'}
Action Items: ${p.analysis?.conclusions?.action_items?.map(a => `• ${a}`).join('\n') ?? '—'}
Наше УТП: ${p.analysis?.conclusions?.our_utp ?? '—'}
Помилки яких уникаємо: ${p.analysis?.conclusions?.mistakes_to_avoid?.map(m => `• ${m}`).join('\n') ?? '—'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ВІДКРИТІ ПИТАННЯ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${p.open_questions?.map((q, i) => `${i + 1}. ${q}`).join('\n') ?? '—'}

OUT OF SCOPE
${p.out_of_scope?.map(o => `• ${o}`).join('\n') ?? '—'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ЯК АПРУВИТИ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ "approved" → BA-агент починає роботу
✏️ "правки: [що змінити]" → паспорт буде оновлено`
}

async function checkForEdits(taskId) {
  const task = await getTask(taskId)

  const comments = await getComments(taskId)
  if (!task.description?.includes('ПАСПОРТ ФИЧИ')) return

  const lastAgentComment = [...comments].reverse().find(c =>
    c.comment_text?.includes('Product Agent') || c.comment_text?.includes('Паспорт оновлено') || c.comment_text?.includes('паспорт фічі')
  )
  const lastAgentTime = lastAgentComment ? Number(lastAgentComment.date) : 0

  const editComment = comments.filter(c => {
    const isAfter = Number(c.date) > lastAgentTime
    const isEdit = c.comment_text?.toLowerCase().startsWith('правки:') ||
      c.comment_text?.toLowerCase().startsWith('зміни:') ||
      c.comment_text?.toLowerCase().startsWith('исправить:') ||
      c.comment_text?.toLowerCase().startsWith('edit:')
    return isAfter && isEdit
  }).pop()

  if (!editComment) return

  console.log(`\n✏️ Правки найдены: ${task.name}`)
  await addComment(taskId, '🤖 Product Agent: вношу правки в паспорт...')

  try {
    const updated = await callClaude(EDIT_PROMPT, `Поточний паспорт:\n${task.description}\n\nПравки:\n${editComment.comment_text}`)
    await updateDesc(taskId, buildDesc(updated))
    await addComment(taskId, `✅ Паспорт оновлено!\n\nВнесено: ${editComment.comment_text}\n\n──────────\nПеревірте і напишіть "approved" коли готово.`)
    console.log(`✅ Паспорт обновлён: ${task.name}`)
  } catch (e) {
    console.error('❌ Ошибка:', e.message)
    await addComment(taskId, `❌ Помилка оновлення: ${e.message}`)
  }
}

async function poll() {
  try {
    const r = await clickup.get(`/list/${LIST_ID}/task`, { params: { tags: ['passport'], include_closed: false, page: 0 } })
    for (const task of r.data.tasks ?? []) { await checkForEdits(task.id); await sleep(500) }
  } catch (e) { console.error('Poll error:', e.message) }
}

const app = express()
app.use(express.json())
app.get('/', (req, res) => res.json({ status: 'running', agent: 'Product Agent' }))
app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.post('/passport', async (req, res) => {
  const { brief } = req.body
  if (!brief) return res.status(400).json({ error: 'brief обязателен' })
  res.json({ status: 'started' })
  try {
    const passport = await callClaude(CREATE_PROMPT, brief)
    const desc = buildDesc(passport)
    const task = await createTask(`[PASSPORT] ${passport.feature_name}`, desc)
    await addComment(task.id, `🤖 Product Agent створив паспорт фічі.\n\nПріоритет: ${passport.business_value?.priority ?? '—'}/10 | AARRR: ${passport.business_value?.aarrr_stage ?? '—'} | Складність: ${passport.tech_assessment?.complexity ?? '—'}\n\n──────────\n✅ Напишіть "approved" → BA-агент починає роботу\n✏️ Напишіть "правки: [що змінити]" → внесу зміни`)
    console.log(`✅ Паспорт создан: ${task.url}`)
  } catch (e) { console.error('❌:', e.message) }
})

app.post('/webhook', async (req, res) => {
  res.sendStatus(200)

  const raw = { ...req.body, ...req.query }
  console.log('📥 Webhook получен:', JSON.stringify(raw).slice(0, 300))

  // ClickUp отправляет данные внутри поля payload
  const payload = raw.payload ?? raw
  const taskId = payload.id || payload.task_id || raw.task_id || raw.id

  console.log('🔍 Task ID:', taskId)

  if (!taskId) {
    console.log('⚠️ Webhook без task_id — пропускаем')
    return
  }

  // Проверяем комментарии (правки) и тег brief
  checkForEdits(taskId).catch(console.error)
  processBriefTask(taskId).catch(console.error)
})

// Обработка задачи с тегом brief
async function processBriefTask(taskId) {
  try {
    const task = await getTask(taskId)

    // Проверяем тег brief
    const hasBriefTag = task.tags?.some(t =>
      t.name?.toLowerCase() === 'brief'
    )
    if (!hasBriefTag) return

    // Проверяем не обрабатывали ли уже
    const comments = await getComments(taskId)
    const alreadyProcessed = comments.find(c =>
      c.comment_text?.includes('Product Agent')
    )
    if (alreadyProcessed) return

    // Берём описание задачи как бриф
    const brief = task.description
    if (!brief || brief.trim().length < 10) {
      await addComment(taskId, '⚠️ Product Agent: описание задачи слишком короткое для создания паспорта. Добавьте подробное описание фичи.')
      return
    }

    console.log(`\n📋 Обрабатываем бриф из задачи: ${task.name}`)
    await addComment(taskId, '🤖 Product Agent: получил бриф, создаю паспорт фичи...')

    const passport = await callClaude(CREATE_PROMPT, `Название фичи: ${task.name}\n\nОписание:\n${brief}`)
    const desc = buildDesc(passport)
    const passportTask = await createTask(`[PASSPORT] ${passport.feature_name}`, desc)

    await addComment(taskId,
      `✅ Паспорт фичи создан!\n\nЗадача: ${passportTask.url}\n\n──────────\nОткройте задачу, проверьте паспорт и напишите "approved" чтобы BA-агент начал проработку PRD.`
    )
    console.log(`✅ Паспорт создан из брифа: ${passportTask.url}`)

  } catch (e) {
    console.error('❌ Ошибка обработки брифа:', e.message)
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
cron.schedule('*/3 * * * *', () => poll().catch(console.error))

app.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📋 Product Agent — SafeButton')
  console.log(`📡 Порт: ${PORT}`)
  console.log('✏️ Правки: "правки: [текст]" в комментарии')
  console.log('✅ Апрув: "approved" в комментарии')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
})
