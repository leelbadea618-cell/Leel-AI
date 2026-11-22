import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Menu, MessageSquarePlus, Send, Sparkles, BookOpen, FileText, PenLine, BriefcaseBusiness, Languages, Trash2, Download } from 'lucide-react';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;

async function getGeminiReply(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    return "Clé Gemini manquante. Ajoute VITE_GEMINI_API_KEY dans les Secrets de Replit.";
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Je n'ai pas reçu de réponse, réessaie.";
  } catch (e) {
    return "Désolé, j'ai eu un petit souci, réessaie.";
  }
}

type Message = { id: string; role: 'user' | 'assistant'; text: string; createdAt: number };
type Conversation = { id: string; title: string; messages: Message[]; updatedAt: number };
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const STORAGE_KEY = 'leel-ai-conversations-v1';
const WELCOME = "Bonjour ! Je suis Leel AI. Comment puis-je t'aider aujourd'hui ?";
const PROMPTS = [
  { text: 'Aide-moi pour mon CV.', icon: FileText },
  { text: 'Explique-moi un cours.', icon: BookOpen },
  { text: 'Écris un message.', icon: PenLine },
  { text: 'Aide-moi à créer une entreprise.', icon: BriefcaseBusiness },
  { text: "Apprends-moi l'anglais.", icon: Languages },
];

function readConversations(): Conversation[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Conversation =>
      !!item && typeof item.id === 'string' && typeof item.title === 'string' &&
      Array.isArray(item.messages) && typeof item.updatedAt === 'number',
    ).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function shortTitle(text: string) {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length > 34 ? `${clean.slice(0, 34)}…` : clean || 'Nouvelle conversation';
}

function timeLabel(timestamp: number) {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
}

function LeelMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark${small ? ' small-mark' : ''}`} aria-hidden="true">
      <svg width={small ? 20 : 24} height={small ? 20 : 24} viewBox="0 0 28 28" fill="none">
        <path d="M5.2 7.1c0-1.05.85-1.9 1.9-1.9S9 6.05 9 7.1v11.3c0 1.1.9 2 2 2h2.1c1.05 0 1.9.85 1.9 1.9s-.85 1.9-1.9 1.9H11c-3.2 0-5.8-2.6-5.8-5.8V7.1Z" fill="currentColor" />
        <path d="M15.2 8.8c0-1.05.85-1.9 1.9-1.9S19 7.75 19 8.8v8.6c0 1.05-.85 1.9-1.9 1.9s-1.9-.85-1.9-1.9V8.8Z" fill="currentColor" opacity=".76" />
        <circle cx="21.8" cy="6.3" r="2.2" fill="currentColor" />
      </svg>
    </span>
  );
}

function App() {
  const [conversations, setConversations] = useState<Conversation[]>(readConversations);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const activeConversation = conversations.find((conversation) => conversation.id === activeId);
  const messages = activeConversation?.messages ?? [];

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations)); } catch { }
  }, [conversations]);

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register(`${base}service-worker.js`).catch(() => undefined);
      }, { once: true });
    }
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => window.removeEventListener('beforeinstallprompt', onInstall);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function startConversation() {
    setActiveId(null);
    setDraft('');
    setSidebarOpen(false);
    window.setTimeout(() => textareaRef.current?.focus(), 40);
  }

  function openConversation(id: string) {
    setActiveId(id);
    setSidebarOpen(false);
  }

  async function sendMessage(content?: string) {
    const text = (content ?? draft).trim();
    if (!text || sending) return;
    const now = Date.now();
    const id = activeId ?? makeId();
    const userMessage: Message = { id: makeId(), role: 'user', text, createdAt: now };
    const current = conversationsRef.current.find((item) => item.id === id);
    const nextConversation: Conversation = {
      id,
      title: current?.title ?? shortTitle(text),
      messages: [...(current?.messages ?? []), userMessage],
      updatedAt: now,
    };
    setActiveId(id);
    setDraft('');
    setSending(true);
    setConversations((previous) => [nextConversation, ...previous.filter((item) => item.id !== id)]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    try {
      const reply = await getGeminiReply(text);
      const assistantMessage: Message = { id: makeId(), role: 'assistant', text: reply, createdAt: Date.now() };
      setConversations((previous) => previous.map((item) =>
        item.id === id ? { ...item, messages: [...item.messages, assistantMessage], updatedAt: Date.now() } : item,
      ).sort((a, b) => b.updatedAt - a.updatedAt));
    } catch {
      const fallback: Message = {
        id: makeId(), role: 'assistant',
        text: "Je n'ai pas réussi à préparer une réponse. Tu peux réessayer en reformulant ta demande.",
        createdAt: Date.now(),
      };
      setConversations((previous) => previous.map((item) =>
        item.id === id ? { ...item, messages: [...item.messages, fallback] } : item,
      ));
    } finally {
      setSending(false);
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function clearCurrentConversation() {
    if (activeId) setConversations((previous) => previous.filter((item) => item.id !== activeId));
    setActiveId(null);
    setDraft('');
    setConfirmClear(false);
    setToast('Cette conversation a été effacée.');
  }

  function removeConversation(event: MouseEvent, id: string) {
    event.stopPropagation();
    setConversations((previous) => previous.filter((item) => item.id !== id));
    if (activeId === id) setActiveId(null);
    setToast('Conversation supprimée.');
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') setToast('Leel AI est en cours d’installation.');
    setInstallPrompt(null);
  }

  return (
    <div className="app-shell">
      {sidebarOpen
 onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`} aria-label="Conversations">
        <div className="brand">
          <LeelMark />
          <div><span className="brand-name">Leel AI</span><span className="brand-sub">À tes côtés, chaque jour</span></div>
        </div>
        <button className="new-chat" data-testid="button-new-conversation" onClick={startConversation}>
          <MessageSquarePlus size={17} strokeWidth={2} /> Nouvelle conversation
        </button>
        <div className="side-label">Récentes</div>
        <div className="history-list">
          {conversations.length === 0 ? (
            <div className="history-empty">Tes conversations apparaîtront ici et resteront sur cet appareil.</div>
          ) : conversations.map((conversation) => (
            <div className="history-row" key={conversation.id}>
              <button
                className={`history-item${conversation.id === activeId ? ' active' : ''}`}
                data-testid={`conversation-${conversation.id}`}
                onClick={() => openConversation(conversation.id)}
                title={conversation.title}
              >{conversation.title}</button>
              <span className="history-menu">
                <button aria-label={`Supprimer ${conversation.title}`} title="Supprimer" onClick={(event) => removeConversation(event, conversation.id)}>
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
          ))}
        </div>
        <div className="sidebar-foot">
          <div className="demo-note"><span className="demo-dot" />Mode démo — tes échanges restent enregistrés sur cet appareil.</div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="mobile-brand">
            <button className="icon-button mobile-menu-button" aria-label="Ouvrir le menu" onClick={() => setSidebarOpen(true)}><Menu size={19} /></button>
            <LeelMark small />
            <span className="brand-name">Leel AI</span>
          </div>
          <div className="topbar-title">Ton espace de conversation</div>
          <div className="topbar-actions">
            <span className="mode-pill"><span className="demo-dot" />Mode démo</span>
            {installPrompt && <button className="icon-button" aria-label="Installer Leel AI" title="Installer l’application" onClick={() => void installApp()}><Download size={17} /></button>}
            {activeConversation && <button className="clear-link" onClick={() => setConfirmClear(true)} data-testid="button-clear-conversation">Effacer</button>}
          </div>
        </header>

        <section className="chat-area" aria-live="polite">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-kicker"><Sparkles size={14} /> Un coup de main, tout simplement</div>
              <h1>{WELCOME}</h1>
              <p className="welcome-copy">Pour apprendre, écrire ou faire avancer tes projets, on peut commencer par une petite question.</p>
              <div className="prompt-grid" aria-label="Suggestions de départ">
                {PROMPTS.map(({ text, icon: Icon }, index) => (
                  <button key={text} className="prompt-card" data-testid={`suggestion-${index}`} onClick={() => void sendMessage(text)}>
                    <span className="prompt-icon"><Icon size={15} /></span>{text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article className={`message-row ${message.role}`} key={message.id} data-testid={`message-${message.id}`}>
                  {message.role === 'assistant' && <span className="assistant-avatar"><LeelMark small /></span>}
                  <div>
                    <div className="message-content">{message.text}</div>
                    <div className="message-time">{message.role === 'user' ? 'Toi' : 'Leel'} · {timeLabel(message.createdAt)}</div>
                  </div>
                </article>
              ))}
              {sending && <div className="message-row assistant" role="status" aria-label="Leel prépare une réponse">
                <span className="assistant-avatar"><LeelMark small /></span>
                <div className="typing"><span /><span /><span /> Leel réfléchit…</div>
              </div>}
              <div ref={bottomRef} />
            </div>
          )}
          <div className="composer-wrap">
            <form className="composer" onSubmit={onSubmit}>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  event.target.style.height = 'auto';
                  event.target.style.height = `${Math.min(event.target.scrollHeight, 150)}px`;
                }}
                onKeyDown={onComposerKeyDown}
                placeholder="Écris ton message…"
                rows={1}
                aria-label="Ton message"
                data-testid="input-message"
                disabled={sending}
              />
              <button className="send-button" type="submit" aria-label="Envoyer le message" data-testid="button-send" disabled={!draft.trim() || sending}>
                <Send size={17} strokeWidth={2.2} />
              </button>
            </form>
            <div className="composer-hint"><span>Leel AI peut se tromper. Vérifie les informations importantes.</span><span><kbd>Entrée</kbd> pour envoyer · <kbd>Maj + Entrée</kbd> à la ligne</span></div>
          </div>
        </section>
      </main>

      {confirmClear && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmClear(false); }}>
        <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-title" aria-describedby="clear-description">
          <h2 id="clear-title">Effacer cette conversation ?</h2>
          <p id="clear-description">Les messages de cette conversation seront supprimés de cet appareil. Cette action ne peut pas être annulée.</p>
          <div className="dialog-actions">
            <button onClick={() => setConfirmClear(false)}>Garder</button>
            <button className="danger" onClick={clearCurrentConversation} data-testid="button-confirm-clear">Effacer</button>
          </div>
        </section>
      </div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

export default App;
toast" role="status">{toast}</div>}
    </div>
  );
}

export default App;
;
