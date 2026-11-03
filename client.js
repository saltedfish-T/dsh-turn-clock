/**
 * Client half of dsh-turn-clock: a right Sidebar tab that lists every turn of
 * the current Session with its date and start time, and jumps the conversation
 * to the turn the reader picks.
 *
 * Times come from this package's own `turnClock` projection through the
 * framework `useProjection` keyed hook, so unloaded turns are included. A jump
 * pages history through the turn's `turn/start` seq with the same
 * `loadThrough` primitive Chat's own rail uses, then brings the turn's
 * transcript row into view.
 */
window.__ModuleLoader__.load({
  id: 'dsh-turn-clock',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const ID = 'dsh-turn-clock'
    const KIND = 'turn-clock'
    const NS = 'turnClock'
    const PROJECTION_KEY = 'turnClock'
    /** Chat marks every transcript row with the turn it belongs to. */
    const ROW_SELECTOR = (turn) => `[data-chat-turn="${turn}"]`
    /** Time to wait for rows to mount after history paging resolves. */
    const SETTLE_MS = 2500

    const zh = {
      'type.label': '时间目录',
      'guide.title': '时间目录',
      'guide.description': '每条对话的日期和时间，点一下就跳过去',
      waiting: '等待这一会话的时间数据…',
      empty: '这个会话还没有已开始的对话轮次。',
      noHook: '这个位置没有拿到 useProjection，插件可能没有装好。',
      turns: '轮',
      unnamed: '第 {turn} 轮',
      promptMissing: '（这一轮没有文字提示）',
      jumpHint: '跳到这一轮',
      jumpFailed: '这一轮还没进到对话里，先往上翻一点再试。',
      jumpPagingFailed: '拉取这段历史的请求失败了，这一轮可能是空的或已被裁剪。',
      jumpNoChat: '当前不在对话视图，切回 Chat 再点。',
      jumpUnavailable: '这个会话暂时不支持跳转。',
    }
    const en = {
      'type.label': 'Turn timeline',
      'guide.title': 'Turn timeline',
      'guide.description': 'Date and time of every turn; click one to go there',
      waiting: 'Waiting for this session’s timing data…',
      empty: 'This session has no started turns yet.',
      noHook: 'This seat did not receive useProjection; the plugin may not be installed correctly.',
      turns: 'turns',
      unnamed: 'Turn {turn}',
      promptMissing: '(no text prompt in this turn)',
      jumpHint: 'Jump to this turn',
      jumpFailed: 'That turn is not in the loaded transcript yet; scroll up a little and retry.',
      jumpPagingFailed: 'Loading that part of the history failed; the turn may be empty or trimmed.',
      jumpNoChat: 'The conversation view is not showing chat right now.',
      jumpUnavailable: 'This session cannot be navigated from here.',
    }

    /** Outline artwork for the guide card. */
    function ClockArtwork() {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: 16,
          height: 16,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          'aria-hidden': true,
        },
        h('circle', { cx: 12, cy: 12, r: 8.4 }),
        h('path', { d: 'M12 7.4v4.9l3.1 1.9' }),
      )
    }

    function pad(value) {
      return value < 10 ? `0${value}` : String(value)
    }

    /** Session event times are epoch milliseconds; tolerate a seconds value. */
    function toDate(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
      const ms = value > 1e12 ? value : value * 1000
      const date = new Date(ms)
      return Number.isNaN(date.getTime()) ? undefined : date
    }

    /**
     * Date and weekday are formatted apart on purpose: the combined
     * `{ month, day, weekday }` pattern renders as "11/2周一" in zh-CN, with no
     * separator between the day and the weekday. Joining two formatters keeps a
     * space in every locale.
     */
    const dateFormat =
      typeof Intl === 'object' && typeof Intl.DateTimeFormat === 'function'
        ? new Intl.DateTimeFormat(undefined, { month: 'numeric', day: 'numeric' })
        : undefined
    const weekdayFormat =
      typeof Intl === 'object' && typeof Intl.DateTimeFormat === 'function'
        ? new Intl.DateTimeFormat(undefined, { weekday: 'short' })
        : undefined

    function dayKey(date) {
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    }

    function dayLabel(date) {
      const day = dateFormat !== undefined ? dateFormat.format(date) : `${date.getMonth() + 1}/${date.getDate()}`
      const weekday = weekdayFormat !== undefined ? weekdayFormat.format(date) : ''
      return weekday === '' ? day : `${day} ${weekday}`
    }

    function timeLabel(date) {
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    /** The wire view is `{ turns: [...] }`; tolerate a bare array. */
    function readTurns(raw) {
      const list = Array.isArray(raw) ? raw : raw !== null && typeof raw === 'object' && Array.isArray(raw.turns) ? raw.turns : []
      const seen = []
      for (const entry of list) {
        if (entry === null || typeof entry !== 'object') continue
        if (typeof entry.turn !== 'number' || !Number.isSafeInteger(entry.turn)) continue
        seen.push({
          turn: entry.turn,
          date: toDate(entry.t),
          seq: typeof entry.s === 'number' && Number.isSafeInteger(entry.s) ? entry.s : undefined,
          prompt: typeof entry.p === 'string' ? entry.p : '',
        })
      }
      return seen
    }

    /**
     * `turn/start` seq per turn, taken from the shipped `turnOutline` projection.
     * It is the fallback when this package's own unit predates the `s` field.
     */
    function readSeqs(outline) {
      const map = new Map()
      if (!Array.isArray(outline)) return map
      for (const entry of outline) {
        if (entry === null || typeof entry !== 'object') continue
        if (typeof entry.turn !== 'number' || typeof entry.seq !== 'number') continue
        map.set(entry.turn, entry.seq)
      }
      return map
    }

    const S = {
      root: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
      },
      header: {
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 8,
        padding: '10px 12px 8px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        fontSize: 12,
        color: 'var(--dsw-alias-label-secondary)',
      },
      headerTitle: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      list: { minHeight: 0, flex: 1, overflowY: 'auto', padding: '4px 0 12px' },
      day: {
        position: 'sticky',
        top: 0,
        zIndex: 1,
        padding: '8px 12px 4px',
        fontSize: 11,
        letterSpacing: '0.02em',
        color: 'var(--dsw-alias-label-secondary)',
        background: 'var(--dsw-alias-bg-base)',
      },
      row: {
        display: 'grid',
        gridTemplateColumns: '46px 1fr 10px',
        gap: 8,
        padding: '6px 12px',
        alignItems: 'baseline',
        cursor: 'pointer',
        border: 'none',
        background: 'transparent',
        width: '100%',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
      },
      rowHover: { background: 'var(--dsw-alias-bg-layer-2)' },
      time: {
        fontSize: 12,
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--dsw-alias-label-secondary)',
      },
      prompt: {
        fontSize: 12.5,
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-primary)',
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        wordBreak: 'break-word',
      },
      chevron: {
        fontSize: 12,
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
        opacity: 0.9,
      },
      note: {
        padding: '24px 16px',
        fontSize: 12,
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
      },
      footer: {
        padding: '8px 12px',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
        fontSize: 11.5,
        lineHeight: '16px',
        color: 'var(--dsw-alias-state-warn-primary)',
      },
    }

    /**
     * The tab body: grouped by calendar day, chronological, newest last.
     * @param props - slot runtime props (`t`, the projection hooks, the jump face).
     */
    function TimelineBody(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const useProjection = typeof props.useProjection === 'function' ? props.useProjection : undefined
      const jumpToTurn = typeof props.jumpToTurn === 'function' ? props.jumpToTurn : undefined

      const raw = useProjection !== undefined ? useProjection(PROJECTION_KEY) : undefined
      const outline = useProjection !== undefined ? useProjection('turnOutline') : undefined
      const turns = readTurns(raw)
      const seqs = React.useMemo(() => readSeqs(outline), [outline])

      const [hovered, setHovered] = React.useState(-1)
      const [hint, setHint] = React.useState(null)

      const listRef = React.useRef(null)
      const stuck = React.useRef(false)
      React.useEffect(() => {
        if (stuck.current) return
        const node = listRef.current
        if (node === null) return
        node.scrollTop = node.scrollHeight
        if (turns.length > 0) stuck.current = true
      }, [turns.length])

      React.useEffect(() => {
        if (hint === null) return undefined
        const timer = setTimeout(() => setHint(null), 3200)
        return () => clearTimeout(timer)
      }, [hint])

      const activate = React.useCallback(
        async (item) => {
          if (jumpToTurn === undefined) {
            setHint({ text: t('jumpUnavailable'), at: Date.now() })
            return
          }
          const seq = item.seq !== undefined ? item.seq : seqs.get(item.turn)
          let outcome = { landed: false, reason: 'notLoaded' }
          try {
            outcome = await jumpToTurn(item.turn, seq)
          } catch {
            outcome = { landed: false, reason: 'paging' }
          }
          if (outcome !== null && typeof outcome === 'object' && outcome.landed === true) {
            setHint(null)
            return
          }
          const inChat = typeof document !== 'undefined' && document.querySelector('[data-chat-flow]') !== null
          const reason = outcome !== null && typeof outcome === 'object' ? outcome.reason : undefined
          const text = !inChat ? t('jumpNoChat') : reason === 'paging' ? t('jumpPagingFailed') : t('jumpFailed')
          setHint({ text, at: Date.now() })
        },
        [jumpToTurn, seqs, t],
      )

      const groups = []
      for (const item of turns) {
        const key = item.date !== undefined ? dayKey(item.date) : ''
        const last = groups.at(-1)
        if (last !== undefined && last.key === key) last.items.push(item)
        else groups.push({ key, date: item.date, items: [item] })
      }

      let body
      if (turns.length === 0) {
        const note = useProjection === undefined ? t('noHook') : raw === undefined ? t('waiting') : t('empty')
        body = h('div', { style: S.note }, note)
      } else {
        body = h(
          'div',
          { ref: listRef, style: S.list },
          groups.map((group) =>
            h(
              'div',
              { key: `d:${group.key}` },
              group.date !== undefined ? h('div', { style: S.day }, dayLabel(group.date)) : null,
              group.items.map((item) =>
                h(
                  'div',
                  {
                    key: `t:${item.turn}`,
                    role: 'button',
                    tabIndex: 0,
                    style: hovered === item.turn ? { ...S.row, ...S.rowHover } : S.row,
                    title: `${t('jumpHint')}${item.prompt === '' ? '' : ` · ${item.prompt}`}`,
                    onMouseEnter: () => setHovered(item.turn),
                    onMouseLeave: () => setHovered(-1),
                    onFocus: () => setHovered(item.turn),
                    onBlur: () => setHovered(-1),
                    onClick: () => {
                      void activate(item)
                    },
                    onKeyDown: (event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      void activate(item)
                    },
                  },
                  h('span', { style: S.time }, item.date !== undefined ? timeLabel(item.date) : '--:--'),
                  h(
                    'span',
                    { style: S.prompt },
                    item.prompt === '' ? t('unnamed').replace('{turn}', String(item.turn)) : item.prompt,
                  ),
                  h('span', { style: { ...S.chevron, opacity: hovered === item.turn ? 1 : 0 } }, '›'),
                ),
              ),
            ),
          ),
        )
      }

      return h(
        'div',
        { style: S.root },
        h(
          'div',
          { style: S.header },
          h('span', { style: S.headerTitle }, t('type.label')),
          h('span', null, `${turns.length} ${t('turns')}`),
        ),
        body,
        hint === null ? null : h('div', { style: S.footer }, hint.text),
      )
    }

    /** Tab-type definition; the guide card is how users reach the page. */
    function definition(t) {
      return {
        id: ID,
        kind: KIND,
        priority: 'builtin',
        title: () => t('type.label'),
        guide: [
          {
            id: 'timeline',
            order: 20,
            title: () => t('guide.title'),
            description: () => t('guide.description'),
            icon: ClockArtwork,
          },
        ],
      }
    }

    const inject = ['slots', 'locale', 'sidebarRightTabs', 'sessions']

    function apply(ctx) {
      const t = ctx.locale.bind(NS)

      /** Transcript rows of one turn, preferring rows that are not folded away. */
      function findRow(turn) {
        if (typeof document === 'undefined') return null
        const matches = document.querySelectorAll(ROW_SELECTOR(turn))
        for (const row of matches) {
          if (row.closest('[hidden]') === null) return row
        }
        return matches.length > 0 ? matches[0] : null
      }

      function nextFrame() {
        return new Promise((resolve) => {
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve())
          else setTimeout(resolve, 16)
        })
      }

      /**
       * Bring one turn into view, paging history in first when it is not loaded.
       * `ctx.sessions.binding(id).session` is the object Chat's own rail pages
       * with through `loadThrough(turnStartSeq)`.
       * @param sessionId - the tab's Session.
       * @param turn - the turn number Chat marks its rows with.
       * @param seq - the turn's `turn/start` seq, the paging target.
       * @returns whether a transcript row was found, and why not when it was not.
       */
      async function jumpToTurn(sessionId, turn, seq) {
        let row = findRow(turn)
        if (row !== null) {
          row.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
          return { landed: true }
        }
        if (typeof seq !== 'number') return { landed: false, reason: 'notLoaded' }

        let session
        try {
          const binding = ctx.sessions.binding(sessionId)
          session = binding === undefined ? undefined : binding.session
        } catch {
          session = undefined
        }
        if (session === undefined || typeof session.loadThrough !== 'function') {
          return { landed: false, reason: 'notLoaded' }
        }

        try {
          await session.loadThrough(seq)
        } catch {
          return { landed: false, reason: 'paging' }
        }

        const deadline = Date.now() + SETTLE_MS
        while (row === null && Date.now() < deadline) {
          await nextFrame()
          row = findRow(turn)
        }
        if (row === null) return { landed: false, reason: 'notLoaded' }
        row.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
        return { landed: true }
      }

      ctx.effect(() => ctx.sidebarRightTabs.register(definition(t)), 'turn-clock: tab type')
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'turn-clock: dictionaries')
      ctx.effect(
        () =>
          ctx.slots.inject('sidebar.right.pane.tab', () =>
            ctx.slots.register(
              {
                name: 'sidebar.right.pane.tab',
                key: ID,
                locale: NS,
                inject: (sessionId) => ({
                  jumpToTurn: (turn, seq) => jumpToTurn(sessionId, turn, seq),
                }),
              },
              TimelineBody,
            ),
          ),
        'turn-clock: tab body',
      )
    }

    return { inject, apply }
  },
})
