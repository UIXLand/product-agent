import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import axios from 'axios'
import express from 'express'

// ─────────────────────────────────────────
// КОНФИГУРАЦИЯ
// ─────────────────────────────────────────

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const clickup = axios.create({
  baseURL: 'https://api.clickup.com/api/v2',
  headers: {
    Authorization: process.env.CLICKUP_API_TOKEN,
    'Content-Type': 'application/json'
  }
})

const LIST_ID = process.env.CLICKUP_LIST_ID
const PORT = process.env.PORT || process.env.PRODUCT_AGENT_PORT || 3001

// ─────────────────────────────────────────
// СИСТЕМНЫЙ ПРОМПТ
// ─────────────────────────────────────────

const PROMPT = `Ты Product Agent продукта SafeButton — мобильного приложения тревожной кнопки (React Native + Supabase).

Контекст SafeButton:
- Два типа пользователей: курируемый (нажимает SOS) и куратор (получает сигнал)
- Стек: React Native + Supabase (PostgreSQL, Auth, Edge Functions, Realtime)
- Рынок: Украина + диаспора в Польше, Чехии, Германии
- Монетизация: Freemium ($0 / $3.99 мес / $29.99 год)
- УТП: одно нажатие → куратор получает Critical Alert с геолокацией, работает глобально
- Бизнес-цель: MAU 2.5k / $3-5k MRR

По брифу или транскрибации создай паспорт фичи по шаблону Syndicate.

Верни ТОЛЬКО валидный JSON без markdown-блоков:

{
  "feature_name": "Короткое название фичи для команды",
  "owner": "Макс",

  "general": {
    "name": "Полное понятное название для команды",
    "why": "Какую бизнес-задачу решаем (1-2 предложения)"
  },

  "business_value": {
    "connection_to_goal": "Как эта фича приближает к MAU 2.5k / $3-5k? Конкретно",
    "aarrr_stage": "Acquisition | Activation | Retention | Referral | Revenue",
    "priority": 7
  },

  "problem_and_solution": {
    "user_pain": "Какую конкретную проблему юзера решаем",
    "solution": "Как именно фича закрывает эту боль. В чём киллер-фича"
  },

  "mechanics": {
    "input": "Что должно произойти чтобы фича сработала",
    "process": "Что делает система внутри",
    "result": "Что юзер получает в итоге",
    "conditions": "Правила и условия работы",
    "integrations": "Нужны ли внешние API или сторонние сервисы"
  },

  "customer_journey": {
    "entry_point": "Откуда юзер узнает о фиче",
    "steps": ["Шаг 1", "Шаг 2", "Шаг 3"],
    "aha_moment": "В какой момент юзер получает ценность"
  },

  "success_metrics": {
    "essence": "Что именно замеряем чтобы понять успех",
    "events": ["Событие 1 для трекинга", "Событие 2"],
    "primary_metric": "Главный показатель",
    "secondary_metrics": ["Retention", "Revenue"],
    "target": "Конкретное число которого хотим достичь"
  },

  "visual_and_content": {
    "copywriting": "Заголовки, кнопки CTA, описания",
    "visual": "Ссылки на референсы или описание",
    "draft_ui": "Описание расположения элементов интерфейса"
  },

  "tech_assessment": {
    "complexity": "Low | Medium | High",
    "estimate": "Примерное время на разработку",
    "dependencies": "Какие другие фичи или части кода затрагивает"
  },

  "analysis": {
    "target_and_value": {
      "user_segment": "Кому показываем",
      "value_proposition": "Что юзер получает на выходе",
      "aha_moment": "В какой момент юзер понимает ценность"
    },
    "market_research": {
      "competitors": [
        {
          "name": "Конкурент",
          "what_they_do": "Что делают аналогичного",
          "strong": "Что круто",
          "weak": "Что отстойно"
        }
      ],
      "strategy": {
        "copy": "Что копируем",
        "improve": "Что улучшаем"
      }
    },
    "conclusions": {
      "what_we_build": "Финальное решение",
      "action_items": ["Фишка 1 которую внедряем", "Фишка 2"],
      "our_utp": "В чём мы круче конкурентов",
      "mistakes_to_avoid": ["Ошибка конкурента которую обойдём"]
    }
  },

  "open_questions": ["Вопрос 1", "Вопрос 2"],
  "out_of_scope": ["Что точно НЕ делаем"]
}`

// ─────────────────────────────────────────
// CLICKUP
// ─────────────────────────────────────────

async function createTask(name, description) {
  const r = await clickup.post(`/list/${LIST_ID}/task`, {
    name,
    description,
    tags: ['passport'],
    status: 'to do'
  })
  return r.data
}

async function addComment(taskId, text) {
  await clickup.post(`/task/${taskId}/comment`, {
    comment_text: text,
    notify_all: false
  })
}

// ─────────────────────────────────────────
// ЛОГИКА
// ─────────────────────────────────────────

async function createPassport(brief) {
  console.log('📋 Product Agent: анализирует бриф...')

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: PROMPT,
    messages: [{ role: 'user', content: brief }]
  })

  const text = response.content[0].text.trim()
  const cleaned = text.replace(/^```json\n?/m, '').replace(/\n?```$/m, '').trim()
  return JSON.parse(cleaned)
}

function buildDescription(p) {
  const competitors = p.analysis?.market_research?.competitors?.map(c =>
    `• ${c.name}: ${c.what_they_do}\n  ✅ Сильное: ${c.strong}\n  ❌ Слабое: ${c.weak}`
  ).join('\n') ?? '—'

  const steps = p.customer_journey?.steps?.map((s, i) => `${i + 1}. ${s}`).join('\n') ?? '—'
  const events = p.success_metrics?.events?.map(e => `• ${e}`).join('\n') ?? '—'
  const actionItems = p.analysis?.conclusions?.action_items?.map(a => `• ${a}`).join('\n') ?? '—'
  const mistakesToAvoid = p.analysis?.conclusions?.mistakes_to_avoid?.map(m => `• ${m}`).join('\n') ?? '—'
  const openQuestions = p.open_questions?.map((q, i) => `${i + 1}. ${q}`).join('\n') ?? '—'
  const outOfScope = p.out_of_scope?.map(o => `• ${o}`).join('\n') ?? '—'
  const secondaryMetrics = p.success_metrics?.secondary_metrics?.map(m => `• ${m}`).join('\n') ?? '—'

  return `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 ПАСПОРТ ФИЧИ | Статус: Draft
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Название: ${p.feature_name}
Owner: ${p.owner ?? 'Макс'}
Дата: ${new Date().toLocaleDateString('ru-RU')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ОБЩИЕ СВЕДЕНИЯ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ОБЩАЯ ИНФОРМАЦИЯ
Название: ${p.general?.name ?? p.feature_name}
Цель (Why): ${p.general?.why ?? '—'}

2. БИЗНЕС-ЦЕННОСТЬ
Связь с целью MAU 2.5k / $3-5k: ${p.business_value?.connection_to_goal ?? '—'}
Воронка AARRR: ${p.business_value?.aarrr_stage ?? '—'}
Приоритет: ${p.business_value?.priority ?? '—'}/10

3. ПРОБЛЕМА И РЕШЕНИЕ
Боль юзера: ${p.problem_and_solution?.user_pain ?? '—'}
Решение: ${p.problem_and_solution?.solution ?? '—'}

4. МЕХАНИКА И ЛОГИКА
Входные данные: ${p.mechanics?.input ?? '—'}
Процесс: ${p.mechanics?.process ?? '—'}
Результат: ${p.mechanics?.result ?? '—'}
Условия: ${p.mechanics?.conditions ?? '—'}
Интеграции: ${p.mechanics?.integrations ?? 'Не требуются'}

5. ПУТЬ ЮЗЕРА (CJM)
Точка входа: ${p.customer_journey?.entry_point ?? '—'}
Шаги взаимодействия:
${steps}
Aha-moment: ${p.customer_journey?.aha_moment ?? '—'}

6. МЕТРИКИ УСПЕХА
Суть: ${p.success_metrics?.essence ?? '—'}
Events для трекинга:
${events}
Primary Metric: ${p.success_metrics?.primary_metric ?? '—'}
Secondary Metrics:
${secondaryMetrics}
Target: ${p.success_metrics?.target ?? '—'}

7. ВИЗУАЛЬНЫЕ НАРАБОТКИ И КОНТЕНТ
Copywriting: ${p.visual_and_content?.copywriting ?? '—'}
Визуал: ${p.visual_and_content?.visual ?? '—'}
Драфт интерфейса: ${p.visual_and_content?.draft_ui ?? '—'}

8. ТЕХНИЧЕСКАЯ ОЦЕНКА
Сложность: ${p.tech_assessment?.complexity ?? '—'}
Оценка: ${p.tech_assessment?.estimate ?? '—'}
Зависимости: ${p.tech_assessment?.dependencies ?? 'Нет'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
АНАЛИЗ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ЦЕЛЕВАЯ АУДИТОРИЯ И ЦЕННОСТЬ
Сегмент: ${p.analysis?.target_and_value?.user_segment ?? '—'}
Value Proposition: ${p.analysis?.target_and_value?.value_proposition ?? '—'}
Aha-moment: ${p.analysis?.target_and_value?.aha_moment ?? '—'}

2. АНАЛИЗ РЫНКА И КОНКУРЕНТОВ
${competitors}

Копируем: ${p.analysis?.market_research?.strategy?.copy ?? '—'}
Улучшаем: ${p.analysis?.market_research?.strategy?.improve ?? '—'}

3. ВЫВОДЫ
Что строим: ${p.analysis?.conclusions?.what_we_build ?? '—'}
Action Items:
${actionItems}
Наше УТП: ${p.analysis?.conclusions?.our_utp ?? '—'}
Ошибки конкурентов которых избегаем:
${mistakesToAvoid}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ОТКРЫТЫЕ ВОПРОСЫ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${openQuestions}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUT OF SCOPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${outOfScope}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
КАК АПРУВИТЬ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Напишите "approved" в комментарии → BA-агент начнёт проработку PRD.`
}

// ─────────────────────────────────────────
// СЕРВЕР
// ─────────────────────────────────────────

const app = express()
app.use(express.json())

app.get('/', (req, res) => res.json({ status: 'running', agent: 'Product Agent' }))
app.get('/health', (req, res) => res.json({ status: 'ok' }))

// POST /passport { "brief": "текст брифа" }
app.post('/passport', async (req, res) => {
  const { brief } = req.body
  if (!brief) return res.status(400).json({ error: 'brief обязателен' })

  res.json({ status: 'started', message: 'Анализирую бриф...' })

  try {
    const passport = await createPassport(brief)
    const description = buildDescription(passport)
    const task = await createTask(`[PASSPORT] ${passport.feature_name}`, description)

    await addComment(task.id,
      `🤖 Product Agent создал паспорт фичи по шаблону Syndicate.\n\nПриоритет: ${passport.business_value?.priority ?? '—'}/10 | AARRR: ${passport.business_value?.aarrr_stage ?? '—'} | Сложность: ${passport.tech_assessment?.complexity ?? '—'}\n\nОткрытых вопросов: ${passport.open_questions?.length ?? 0}\n\n──────────\n👉 Проверьте паспорт и напишите "approved" для BA-агента.`
    )

    console.log(`✅ Паспорт создан: ${task.url}`)
  } catch (e) {
    console.error('❌ Ошибка:', e.message)
  }
})

app.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📋 Product Agent — SafeButton')
  console.log(`📡 Порт: ${PORT}`)
  console.log('📋 Шаблон: Syndicate Feature Passport')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('POST /passport { "brief": "текст" }')
})
