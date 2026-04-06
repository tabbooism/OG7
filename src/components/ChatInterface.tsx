import React, { useState, useRef, useEffect } from 'react';
import { Send, Shield, Terminal, Search, Globe, Cpu, Loader2, ChevronRight, Play, CheckCircle2, AlertCircle, Box, X, Maximize2, Activity, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { streamNightfuryResponse, Message, CodeExecutionStep, ai, executeCode } from '../lib/gemini';
import { cn } from '../lib/utils';

const CodeBlock = ({ className, children, runInSandbox, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  const detectedLang = match ? match[1] : '';
  const [selectedLang, setSelectedLang] = useState(detectedLang || 'js');
  const code = String(children).replace(/\n$/, '');
  
  return (
    <div className="relative group my-3 sm:my-4">
      <div className="absolute top-2 right-2 flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10 bg-black/80 p-1 rounded border border-[#00ff41]/20 backdrop-blur-sm">
        <select 
          value={selectedLang}
          onChange={(e) => setSelectedLang(e.target.value)}
          className="text-[8px] sm:text-[10px] bg-transparent border-none text-[#00ff41]/60 focus:ring-0 outline-none cursor-pointer uppercase"
        >
          <option value="js" className="bg-[#0a0a0a]">JS</option>
          <option value="python" className="bg-[#0a0a0a]">PY</option>
          <option value="bash" className="bg-[#0a0a0a]">SH</option>
        </select>
        <button 
          onClick={() => runInSandbox(code, selectedLang)}
          title={`Run in ${selectedLang.toUpperCase()} Sandbox`}
          className="p-1 sm:p-1.5 bg-[#00ff41]/10 border border-[#00ff41]/30 rounded text-[#00ff41] hover:bg-[#00ff41]/20 transition-colors"
        >
          <Play className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
        </button>
      </div>
      <pre className={cn(className, "text-[10px] sm:text-xs pt-8 sm:pt-10")} {...props}>
        <code>{children}</code>
      </pre>
    </div>
  );
};

export default function ChatInterface() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSandboxActive, setIsSandboxActive] = useState(true);
  const [targetDomain, setTargetDomain] = useState('rh420.xyz');
  const [targetHistory, setTargetHistory] = useState<string[]>(['rh420.xyz']);
  const [isTargetLocked, setIsTargetLocked] = useState(false);
  const [sandboxOutput, setSandboxOutput] = useState<{ code: string; output: string; type: 'js' | 'python' | 'error' } | null>(null);
  const [threatIntel, setThreatIntel] = useState<{ id: string; title: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; description: string; timestamp: string }[]>([]);
  const [isIntelLoading, setIsIntelLoading] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState<string | null>(null);
  const [autoSuggestions, setAutoSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persistence: Load targets and current session on mount
  useEffect(() => {
    const savedTargets = localStorage.getItem('nightfury_targets_v1');
    const lastTarget = localStorage.getItem('nightfury_last_target_v1');
    const savedIntel = localStorage.getItem(`nightfury_intel_${lastTarget || 'rh420.xyz'}`);
    
    if (savedIntel) {
      try {
        setThreatIntel(JSON.parse(savedIntel));
      } catch (e) {
        console.error('Failed to parse saved intel:', e);
      }
    }
    
    if (savedTargets) {
      try {
        const targets = JSON.parse(savedTargets);
        setTargetHistory(targets);
        if (lastTarget && targets.includes(lastTarget)) {
          setTargetDomain(lastTarget);
          loadSession(lastTarget);
        } else {
          loadSession(targets[0]);
        }
      } catch (e) {
        console.error('Failed to parse saved targets:', e);
      }
    } else {
      initializeRecon('rh420.xyz');
    }
  }, []);

  // Persistence: Save current session whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`nightfury_session_${targetDomain}`, JSON.stringify(messages));
    }
  }, [messages]);

  // Persistence: Save threat intel whenever it changes
  useEffect(() => {
    if (threatIntel.length > 0) {
      localStorage.setItem(`nightfury_intel_${targetDomain}`, JSON.stringify(threatIntel));
    }
  }, [threatIntel]);

  // Persistence: Save targets list
  useEffect(() => {
    localStorage.setItem('nightfury_targets_v1', JSON.stringify(targetHistory));
  }, [targetHistory]);

  const loadSession = (domain: string) => {
    const savedMessages = localStorage.getItem(`nightfury_session_${domain}`);
    const savedIntel = localStorage.getItem(`nightfury_intel_${domain}`);
    
    if (savedIntel) {
      try {
        setThreatIntel(JSON.parse(savedIntel));
      } catch (e) {
        setThreatIntel([]);
      }
    } else {
      setThreatIntel([]);
    }

    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (e) {
        console.error(`Failed to parse session for ${domain}:`, e);
        initializeRecon(domain);
      }
    } else {
      initializeRecon(domain);
    }
  };

  const initializeRecon = async (domain: string) => {
    setIsLoading(true);
    setIsTargetLocked(true);
    setTargetDomain(domain);
    localStorage.setItem('nightfury_last_target_v1', domain);
    
    const initialMessage: Message = { 
      role: 'model', 
      text: '', 
      isThinking: true,
      codeExecutionSteps: [] 
    };
    setMessages([initialMessage]);

    try {
      await processStream(`Perform an initial reconnaissance analysis on the domain ${domain}. Focus on DNS records, potential subdomains, and common backend vulnerabilities for a .xyz domain. Provide a summary of attack vectors to explore.`, domain);
    } catch (error) {
      console.error('Error initializing recon:', error);
    } finally {
      setIsLoading(false);
      setTimeout(() => setIsTargetLocked(false), 3000);
    }
  };

  const addNewTarget = () => {
    const newDomain = window.prompt('Enter new target domain (e.g., example.com):');
    if (newDomain && !targetHistory.includes(newDomain)) {
      // Save current target's data before switching
      if (messages.length > 0) {
        localStorage.setItem(`nightfury_session_${targetDomain}`, JSON.stringify(messages));
      }
      if (threatIntel.length > 0) {
        localStorage.setItem(`nightfury_intel_${targetDomain}`, JSON.stringify(threatIntel));
      }

      setTargetHistory(prev => [...prev, newDomain]);
      setTargetDomain(newDomain);
      setMessages([]);
      setThreatIntel([]);
      initializeRecon(newDomain);
    } else if (newDomain && targetHistory.includes(newDomain)) {
      switchTarget(newDomain);
    }
  };

  const switchTarget = (domain: string) => {
    if (domain === targetDomain) return;
    
    // Explicitly save current data before switching
    if (messages.length > 0) {
      localStorage.setItem(`nightfury_session_${targetDomain}`, JSON.stringify(messages));
    }
    if (threatIntel.length > 0) {
      localStorage.setItem(`nightfury_intel_${targetDomain}`, JSON.stringify(threatIntel));
    }

    setTargetDomain(domain);
    localStorage.setItem('nightfury_last_target_v1', domain);
    loadSession(domain);
  };

  const fetchThreatIntel = async () => {
    if (isIntelLoading) return;
    setIsIntelLoading(true);
    
    const intelPrompt = `THREAT_INTELLIGENCE_QUERY: Fetch the latest CVEs, threat actor activities, and zero-day reports relevant to the technology stack of ${targetDomain}. 
    Format the response as a JSON array of objects with: id, title, severity (LOW|MEDIUM|HIGH|CRITICAL), description, and timestamp. 
    Only return the JSON array.`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: intelPrompt,
        config: {
          systemInstruction: "You are a threat intelligence module. Return ONLY a JSON array of threat objects. No markdown, no preamble.",
          responseMimeType: "application/json",
          tools: [{ googleSearch: {} }]
        }
      });

      const data = JSON.parse(response.text || '[]');
      setThreatIntel(data);
      localStorage.setItem(`nightfury_intel_${targetDomain}`, JSON.stringify(data));
    } catch (error) {
      console.error('Error fetching threat intel:', error);
    } finally {
      setIsIntelLoading(false);
    }
  };

  const triggerLiveScan = async () => {
    if (isLoading) return;
    
    const scanPrompt = `TRIGGER_LIVE_SCAN: Perform a real-time, high-fidelity scan of ${targetDomain} using Google Search and technical analysis. 
    Identify:
    1. Actively exposed services (ports, APIs, subdomains).
    2. Recent vulnerabilities or CVEs associated with the detected tech stack.
    3. Publicly accessible configuration files or sensitive endpoints.
    Provide raw technical data and specific exploit vectors.`;

    const userMessage: Message = { role: 'user', text: `[SYSTEM_COMMAND] INITIATE_LIVE_SCAN --target ${targetDomain}` };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const modelMessage: Message = { 
      role: 'model', 
      text: '', 
      isThinking: true,
      codeExecutionSteps: [] 
    };
    setMessages(prev => [...prev, modelMessage]);

    try {
      await processStream(scanPrompt, targetDomain);
    } catch (error) {
      console.error('Error during live scan:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerDeepToolScan = async () => {
    if (isLoading) return;
    
    const scanPrompt = `DEEP_TOOL_INTEGRATION_SCAN: Analyze the identified technology stack for ${targetDomain}. 
    1. Identify specific versions of services (Nginx, CMS, Frameworks).
    2. Generate and display relevant Shodan dorks/queries for these services.
    3. Search for and list specialized vulnerability scanners, Nmap scripts, or Metasploit modules relevant to the stack.
    4. Provide links to official security advisories for detected versions.`;

    const userMessage: Message = { role: 'user', text: `[SYSTEM_COMMAND] INITIATE_DEEP_TOOL_SCAN --target ${targetDomain}` };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const modelMessage: Message = { 
      role: 'model', 
      text: '', 
      isThinking: true,
      codeExecutionSteps: [] 
    };
    setMessages(prev => [...prev, modelMessage]);

    try {
      await processStream(scanPrompt, targetDomain);
    } catch (error) {
      console.error('Error during deep tool scan:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const triggerPageScrape = async () => {
    if (isLoading) return;
    
    const url = window.prompt('Enter URL to scrape (must be associated with target):', `https://${targetDomain}`);
    if (!url) return;

    const userMessage: Message = { role: 'user', text: `[SYSTEM_COMMAND] SCRAPE_PAGE --url ${url}` };
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setScrapeStatus('INITIALIZING_SCRAPER');

    const modelMessage: Message = { 
      role: 'model', 
      text: '', 
      isThinking: true,
      codeExecutionSteps: [] 
    };
    setMessages(prev => [...prev, modelMessage]);

    const scrapePrompt = `SCRAPE_PAGE_QUERY: Use the urlContext tool to fetch and analyze the content of ${url}. 
    Provide a detailed breakdown of the page structure, identified technologies, sensitive information (if any), and a concise summary of the content. 
    If the content is extensive, prioritize the most relevant technical and security-related information.`;

    try {
      setScrapeStatus('FETCHING_URL');
      // Simulate some progress steps for better UX
      setTimeout(() => setScrapeStatus('PARSING_CONTENT'), 2000);
      setTimeout(() => setScrapeStatus('GENERATING_SUMMARY'), 4000);
      
      await processStream(scrapePrompt, targetDomain);
    } catch (error) {
      console.error('Error during page scrape:', error);
    } finally {
      setIsLoading(false);
      setScrapeStatus(null);
    }
  };

  const processStream = async (prompt: string, domain: string = targetDomain) => {
    let fullText = '';
    let groundingMetadata = null;
    let currentSteps: CodeExecutionStep[] = [];
    
    const stream = streamNightfuryResponse(prompt, domain);
    
    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      
      if (parts) {
        for (const part of parts) {
          if (part.text) {
            fullText += part.text;
          }
          
          if (part.executableCode) {
            currentSteps.push({ code: part.executableCode.code });
          }
          
          if (part.codeExecutionResult && currentSteps.length > 0) {
            const lastStep = currentSteps[currentSteps.length - 1];
            lastStep.outcome = part.codeExecutionResult.output;
          }
        }
      }

      groundingMetadata = chunk.candidates?.[0]?.groundingMetadata || groundingMetadata;
      
      // Parse suggestions if present
      let suggestions: { title: string; prompt: string; icon?: string }[] = [];
      const suggestionMatch = fullText.match(/<PROACTIVE_SUGGESTIONS>([\s\S]*?)<\/PROACTIVE_SUGGESTIONS>/);
      let cleanText = fullText;
      
      if (suggestionMatch) {
        try {
          suggestions = JSON.parse(suggestionMatch[1]);
          cleanText = fullText.replace(/<PROACTIVE_SUGGESTIONS>[\s\S]*?<\/PROACTIVE_SUGGESTIONS>/, '').trim();
        } catch (e) {
          console.error('Failed to parse suggestions:', e);
        }
      }

      setMessages(prev => {
        const newMessages = [...prev];
        const last = newMessages[newMessages.length - 1];
        if (last && last.role === 'model') {
          last.text = cleanText;
          last.isThinking = false;
          last.groundingMetadata = groundingMetadata;
          last.codeExecutionSteps = [...currentSteps];
          last.suggestions = suggestions;
        }
        return newMessages;
      });
    }
  };

  const handleSuggestionClick = (prompt: string) => {
    setInput(prompt);
    // Auto-submit after a small delay to feel natural
    setTimeout(() => {
      const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
      if (submitBtn) submitBtn.click();
    }, 100);
  };

  const clearSession = () => {
    if (window.confirm(`Are you sure you want to terminate the current session for ${targetDomain} and clear all logs?`)) {
      localStorage.removeItem(`nightfury_session_${targetDomain}`);
      setMessages([]);
      initializeRecon(targetDomain);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const runInSandbox = async (code: string, lang: string) => {
    if (!isSandboxActive) return;
    
    const normalizedLang = lang.toLowerCase();
    const type = normalizedLang === 'python' ? 'python' : (normalizedLang === 'js' || normalizedLang === 'javascript' ? 'js' : 'js');
    
    setSandboxOutput({ code, output: 'INITIALIZING_SANDBOX...', type });

    if (normalizedLang === 'javascript' || normalizedLang === 'js') {
      try {
        const log: string[] = [];
        const customConsole = {
          log: (...args: any[]) => log.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
          error: (...args: any[]) => log.push(`ERROR: ${args.join(' ')}`),
        };
        
        const sandboxFn = new Function('console', code);
        sandboxFn(customConsole);
        setSandboxOutput({ code, output: log.join('\n') || 'Execution completed with no output.', type: 'js' });
      } catch (err: any) {
        setSandboxOutput({ code, output: `RUNTIME_ERROR: ${err.message}`, type: 'error' });
      }
    } else if (normalizedLang === 'python' || normalizedLang === 'bash' || normalizedLang === 'sh' || normalizedLang === 'shell') {
      setSandboxOutput({ 
        code, 
        output: `INITIALIZING_${normalizedLang.toUpperCase()}_ENVIRONMENT...\nESTABLISHING_SECURE_TUNNEL...\nEXECUTING_REMOTE_MODULE...`, 
        type 
      });
      
      try {
        const result = await executeCode(code, normalizedLang);
        setSandboxOutput({ code, output: result, type });
      } catch (err: any) {
        setSandboxOutput({ code, output: `EXECUTION_ERROR: ${err.message}`, type: 'error' });
      }
    } else {
      setSandboxOutput({ code, output: `UNSUPPORTED_RUNTIME: ${lang}`, type: 'error' });
    }
  };

  const RECON_COMMANDS = [
    'INITIATE_LIVE_SCAN',
    'INITIATE_DEEP_TOOL_SCAN',
    'SCRAPE_PAGE --url',
    'THREAT_INTELLIGENCE_QUERY',
    'DNS_RECON',
    'SUBDOMAIN_ENUMERATION',
    'PORT_SCAN',
    'VULNERABILITY_ASSESSMENT',
    'EXPLOIT_SEARCH',
    'SHODAN_QUERY',
    'WHOIS_LOOKUP',
    'REVERSE_DNS',
    'SSL_ANALYSIS',
    '--target',
    '--url',
    '--verbose',
    '--output json',
    '--depth 3'
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);

    if (value.trim()) {
      const lastWord = value.split(' ').pop() || '';
      if (lastWord.length >= 1) {
        const filtered = RECON_COMMANDS.filter(cmd => 
          cmd.toLowerCase().startsWith(lastWord.toLowerCase()) ||
          cmd.toLowerCase().includes(lastWord.toLowerCase())
        ).slice(0, 5);
        setAutoSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
        setSelectedSuggestionIndex(-1);
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => (prev + 1) % autoSuggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => (prev - 1 + autoSuggestions.length) % autoSuggestions.length);
      } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
        e.preventDefault();
        applySuggestion(autoSuggestions[selectedSuggestionIndex]);
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    }
  };

  const applySuggestion = (suggestion: string) => {
    const words = input.split(' ');
    words.pop();
    const newValue = [...words, suggestion].join(' ') + ' ';
    setInput(newValue);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const modelMessage: Message = { 
      role: 'model', 
      text: '', 
      isThinking: true,
      codeExecutionSteps: [] 
    };
    setMessages(prev => [...prev, modelMessage]);

    try {
      await processStream(input, targetDomain);
    } catch (error) {
      console.error('Error streaming response:', error);
      setMessages(prev => [
        ...prev,
        { role: 'model', text: 'ERROR: Connection to reconnaissance engine failed. Check API configuration.' }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-[#00ff41] font-mono selection:bg-[#00ff41] selection:text-black overflow-hidden">
      {/* Header */}
      <header className="border-b border-[#1a1a1a] p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-black/50 backdrop-blur-md sticky top-0 z-40 gap-3 sm:gap-0">
        {/* Target Locked Overlay */}
        <AnimatePresence>
          {isTargetLocked && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-[#00ff41]/5 backdrop-blur-sm pointer-events-none"
            >
              <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-2 sm:py-3 bg-black border-2 border-[#00ff41] rounded-lg shadow-[0_0_30px_rgba(0,255,65,0.2)] mx-4">
                <div className="relative">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-[#00ff41] rounded-full animate-ping opacity-50" />
                  <Shield className="w-6 h-6 sm:w-8 sm:h-8 absolute top-0 left-0 text-[#00ff41]" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs sm:text-sm font-bold uppercase tracking-widest text-[#00ff41]">Target Locked</span>
                  <span className="text-[8px] sm:text-[10px] uppercase text-[#00ff41]/60 tracking-tighter">{targetDomain} // Initiating Recon</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="p-1.5 sm:p-2 bg-[#00ff41]/10 rounded border border-[#00ff41]/30">
            <Shield className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-sm sm:text-lg font-bold tracking-tighter uppercase">Nightfury Recon Engine</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[8px] sm:text-[10px] text-[#00ff41]/60">
              <span className="flex items-center gap-1"><Terminal className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> READY</span>
              <span className="flex items-center gap-1"><Globe className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> ACTIVE</span>
              <span className={cn(
                "flex items-center gap-1 transition-colors",
                isSandboxActive ? "text-[#00ff41]" : "text-red-500"
              )}>
                <Box className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> SANDBOX_{isSandboxActive ? "ON" : "OFF"}
              </span>
              <div className="flex items-center gap-1 text-[#00ff41]/80 border-l border-[#1a1a1a] pl-2 ml-1 sm:ml-2">
                <Search className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <select 
                  value={targetDomain}
                  onChange={(e) => switchTarget(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 cursor-pointer text-[#00ff41] font-bold outline-none"
                >
                  {targetHistory.map(domain => (
                    <option key={domain} value={domain} className="bg-[#0a0a0a] text-[#00ff41]">{domain}</option>
                  ))}
                </select>
                <button 
                  onClick={addNewTarget}
                  className="ml-1 p-0.5 hover:bg-[#00ff41]/20 rounded transition-colors"
                  title="Add New Target"
                >
                  <Maximize2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 rotate-45" />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button 
            onClick={fetchThreatIntel}
            disabled={isIntelLoading}
            className={cn(
              "flex-shrink-0 flex items-center gap-1.5 text-[9px] sm:text-[10px] px-2 sm:px-3 py-1 rounded border transition-all uppercase tracking-widest disabled:opacity-30",
              isIntelLoading 
                ? "bg-blue-500/10 border-blue-500/30 text-blue-500 cursor-wait" 
                : "bg-blue-500/20 border-blue-500/40 text-blue-400 hover:bg-blue-500/30"
            )}
          >
            {isIntelLoading ? <Loader2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-spin" /> : <Activity className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
            <span className="hidden xs:inline">Threat Intel</span><span className="xs:hidden">Intel</span>
          </button>
          <button 
            onClick={triggerDeepToolScan}
            disabled={isLoading}
            className="flex-shrink-0 flex items-center gap-1.5 text-[9px] sm:text-[10px] px-2 sm:px-3 py-1 bg-[#00ff41]/10 border border-[#00ff41]/30 text-[#00ff41] rounded hover:bg-[#00ff41]/20 transition-all uppercase tracking-widest disabled:opacity-30"
          >
            <Cpu className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> <span className="hidden xs:inline">Deep Scan</span><span className="xs:hidden">Deep</span>
          </button>
          <button 
            onClick={triggerLiveScan}
            disabled={isLoading}
            className="flex-shrink-0 flex items-center gap-1.5 text-[9px] sm:text-[10px] px-2 sm:px-3 py-1 bg-red-500/10 border border-red-500/30 text-red-500 rounded hover:bg-red-500/20 transition-all uppercase tracking-widest disabled:opacity-30"
          >
            <Search className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> <span className="hidden xs:inline">Live Scan</span><span className="xs:hidden">Live</span>
          </button>
          <button 
            onClick={triggerPageScrape}
            disabled={isLoading}
            className="flex-shrink-0 flex items-center gap-1.5 text-[9px] sm:text-[10px] px-2 sm:px-3 py-1 bg-orange-500/10 border border-orange-500/30 text-orange-500 rounded hover:bg-orange-500/20 transition-all uppercase tracking-widest disabled:opacity-30"
          >
            <Globe className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> <span className="hidden xs:inline">Scrape</span><span className="xs:hidden">Scrape</span>
          </button>
          <button 
            onClick={clearSession}
            className="flex-shrink-0 text-[9px] sm:text-[10px] px-2 py-1 border border-[#00ff41]/30 text-[#00ff41]/40 hover:text-[#00ff41] hover:bg-[#00ff41]/10 rounded transition-all uppercase tracking-widest"
          >
            Clear
          </button>
          <button 
            onClick={() => setIsSandboxActive(!isSandboxActive)}
            className={cn(
              "flex-shrink-0 text-[9px] sm:text-[10px] px-2 py-1 rounded border transition-all uppercase tracking-widest",
              isSandboxActive 
                ? "border-[#00ff41]/30 text-[#00ff41]/60 hover:bg-[#00ff41]/10" 
                : "border-red-500/30 text-red-500/60 hover:bg-red-500/10"
            )}
          >
            {isSandboxActive ? "Sandbox" : "No Sandbox"}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Chat Area */}
        <main 
          ref={scrollRef}
          className={cn(
            "flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 sm:space-y-6 scrollbar-thin scrollbar-thumb-[#1a1a1a] scrollbar-track-transparent transition-all duration-500",
            sandboxOutput ? "sm:mr-[400px]" : "mr-0"
          )}
        >
          {/* Threat Intel Panel */}
          {threatIntel.length > 0 && (
            <div className="mb-6 sm:mb-8 border border-blue-500/20 rounded-lg bg-blue-500/5 overflow-hidden shadow-[0_0_30px_rgba(59,130,246,0.05)]">
              <div className="bg-blue-500/10 px-3 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between border-b border-blue-500/20">
                <div className="flex items-center gap-2 text-[9px] sm:text-[11px] font-bold text-blue-400 uppercase tracking-widest">
                  <Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Live Threat Intelligence Feed
                </div>
                <div className="text-[7px] sm:text-[9px] text-blue-500/60 uppercase font-mono">
                  Target: {targetDomain}
                </div>
              </div>
              <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {threatIntel.map((intel) => (
                  <div key={intel.id} className="bg-black/40 border border-blue-500/10 p-2.5 sm:p-3 rounded space-y-1.5 sm:space-y-2 hover:border-blue-500/30 transition-all group">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[9px] sm:text-[11px] font-bold text-blue-300 leading-tight group-hover:text-blue-200 transition-colors">{intel.title}</h3>
                      <span className={cn(
                        "text-[6px] sm:text-[8px] px-1 sm:px-1.5 py-0.5 rounded font-bold uppercase whitespace-nowrap",
                        intel.severity === 'CRITICAL' ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                        intel.severity === 'HIGH' ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" :
                        intel.severity === 'MEDIUM' ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" :
                        "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      )}>
                        {intel.severity}
                      </span>
                    </div>
                    <p className="text-[8px] sm:text-[10px] text-blue-100/60 leading-relaxed line-clamp-2">{intel.description}</p>
                    <div className="flex items-center justify-between text-[6px] sm:text-[8px] text-blue-500/40 uppercase pt-1 font-mono">
                      <span>{intel.id}</span>
                      <span>{intel.timestamp}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 sm:space-y-6 opacity-60">
              <div className="relative">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  className="w-16 h-16 sm:w-24 sm:h-24 border-2 border-dashed border-[#00ff41]/20 rounded-full"
                />
                <Shield className="w-8 h-8 sm:w-10 sm:h-10 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#00ff41]/40" />
              </div>
              <div className="max-w-md space-y-2 px-4">
                <p className="text-xs sm:text-sm">Awaiting reconnaissance parameters...</p>
                <p className="text-[8px] sm:text-[10px] uppercase tracking-widest">Input target or research query to begin high-fidelity analysis</p>
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex flex-col gap-1.5 sm:gap-2 max-w-4xl mx-auto",
                  msg.role === 'user' ? "items-end" : "items-start"
                )}
              >
                <div className={cn(
                  "flex items-center gap-2 text-[8px] sm:text-[10px] uppercase tracking-wider mb-0.5",
                  msg.role === 'user' ? "text-[#00ff41]/40" : "text-[#00ff41]/60"
                )}>
                  {msg.role === 'user' ? (
                    <>OPERATOR <ChevronRight className="w-2.5 h-2.5 sm:w-3 sm:h-3" /></>
                  ) : (
                    <><Shield className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> NIGHTFURY_ENGINE</>
                  )}
                </div>
                
                <div className={cn(
                  "p-3 sm:p-4 rounded-lg border text-xs sm:text-sm leading-relaxed w-full space-y-3 sm:space-y-4",
                  msg.role === 'user' 
                    ? "bg-[#1a1a1a] border-[#333] text-[#e0e0e0] ml-4 sm:ml-12" 
                    : "bg-black border-[#00ff41]/20 text-[#00ff41] mr-4 sm:mr-12 shadow-[0_0_20px_rgba(0,255,65,0.05)]"
                )}>
                  {msg.isThinking ? (
                    <div className="flex flex-col gap-2 py-1 sm:py-2">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                        <span className="animate-pulse text-[10px] sm:text-xs">
                          {scrapeStatus ? (
                            <span className="flex items-center gap-2">
                              <span className="text-[#00ff41] font-bold">[{scrapeStatus}]</span>
                              <span>Analyzing target infrastructure...</span>
                            </span>
                          ) : (
                            "Analyzing attack vectors & exploring non-linear edge cases..."
                          )}
                        </span>
                      </div>
                      {scrapeStatus && (
                        <div className="w-full bg-[#00ff41]/5 h-1 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: "0%" }}
                            animate={{ 
                              width: scrapeStatus === 'INITIALIZING_SCRAPER' ? "10%" :
                                     scrapeStatus === 'FETCHING_URL' ? "30%" :
                                     scrapeStatus === 'PARSING_CONTENT' ? "60%" :
                                     scrapeStatus === 'GENERATING_SUMMARY' ? "90%" : "100%"
                            }}
                            className="h-full bg-[#00ff41] shadow-[0_0_10px_#00ff41]"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Code Execution Steps */}
                      {msg.codeExecutionSteps && msg.codeExecutionSteps.length > 0 && (
                        <div className="space-y-2 sm:space-y-3 mb-3 sm:mb-4">
                          {msg.codeExecutionSteps.map((step, idx) => (
                            <div key={idx} className="border border-[#00ff41]/10 rounded overflow-hidden">
                              <div className="bg-[#00ff41]/5 px-2 sm:px-3 py-1 flex items-center justify-between border-b border-[#00ff41]/10">
                                <div className="flex items-center gap-1.5 sm:gap-2 text-[8px] sm:text-[10px] uppercase tracking-tighter text-[#00ff41]/60">
                                  <Play className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> STEP_{idx + 1}
                                </div>
                                <div className="flex items-center gap-1 text-[7px] sm:text-[8px] text-[#00ff41]/40">
                                  <Box className="w-2 h-2" /> ISOLATED
                                </div>
                              </div>
                              <div className="p-2 sm:p-3 bg-black/40 font-mono text-[10px] sm:text-[11px] text-[#00ff41]/80 overflow-x-auto">
                                <code>{step.code}</code>
                              </div>
                              {step.outcome && (
                                <div className="p-2 sm:p-3 bg-[#00ff41]/5 border-t border-[#00ff41]/10 font-mono text-[10px] sm:text-[11px] text-white/90 whitespace-pre-wrap">
                                  <div className="flex items-center gap-1.5 sm:gap-2 text-[8px] sm:text-[9px] uppercase text-[#00ff41]/40 mb-1">
                                    <Terminal className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> STDOUT
                                  </div>
                                  {step.outcome}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="markdown-body prose prose-invert prose-green max-w-none text-xs sm:text-sm">
                        <Markdown
                          components={{
                            p({ children }) {
                              return <div className="mb-4 last:mb-0">{children}</div>;
                            },
                            code({ node, inline, className, children, ...props }: any) {
                              if (!inline) {
                                return (
                                  <CodeBlock 
                                    className={className} 
                                    runInSandbox={runInSandbox} 
                                    {...props}
                                  >
                                    {children}
                                  </CodeBlock>
                                );
                              }
                              return (
                                <code className={cn(className, "text-[10px] sm:text-xs")} {...props}>
                                  {children}
                                </code>
                              );
                            }
                          }}
                        >
                          {msg.text}
                        </Markdown>
                      </div>

                      {/* Proactive Suggestions */}
                      {msg.suggestions && msg.suggestions.length > 0 && (
                        <div className="mt-4 sm:mt-6 pt-4 border-t border-[#00ff41]/10 space-y-3">
                          <div className="flex items-center gap-2 text-[8px] sm:text-[10px] text-[#00ff41]/40 uppercase tracking-widest font-bold">
                            <Zap className="w-3 h-3" /> Recommended Next Steps
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {msg.suggestions.map((suggestion, idx) => {
                              const Icon = (suggestion.icon && (
                                suggestion.icon === 'Shield' ? Shield :
                                suggestion.icon === 'Search' ? Search :
                                suggestion.icon === 'Terminal' ? Terminal :
                                suggestion.icon === 'Globe' ? Globe :
                                suggestion.icon === 'Cpu' ? Cpu :
                                suggestion.icon === 'Activity' ? Activity : Zap
                              )) || Zap;

                              return (
                                <button
                                  key={idx}
                                  onClick={() => handleSuggestionClick(suggestion.prompt)}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-[#00ff41]/5 border border-[#00ff41]/20 rounded text-[10px] sm:text-xs text-[#00ff41]/80 hover:bg-[#00ff41]/10 hover:border-[#00ff41]/40 transition-all group"
                                >
                                  <Icon className="w-3 h-3 text-[#00ff41]/60 group-hover:text-[#00ff41]" />
                                  <span>{suggestion.title}</span>
                                  <ChevronRight className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {msg.groundingMetadata?.searchEntryPoint && (
                    <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-[#00ff41]/10">
                      <div className="flex items-center gap-1.5 sm:gap-2 text-[8px] sm:text-[10px] text-[#00ff41]/40 mb-2">
                        <Search className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> GROUNDING_SOURCES
                      </div>
                      <div 
                        className="text-[10px] sm:text-xs text-[#00ff41]/80 hover:text-[#00ff41] transition-colors"
                        dangerouslySetInnerHTML={{ __html: msg.groundingMetadata.searchEntryPoint.htmlContent }}
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </main>

        {/* Sandbox Output Panel */}
        <AnimatePresence>
          {sandboxOutput && (
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="fixed right-0 top-[100px] sm:top-[73px] bottom-[100px] w-full sm:w-[400px] bg-[#0a0a0a] border-l border-[#1a1a1a] flex flex-col z-50 shadow-[-20px_0_50px_rgba(0,0,0,0.5)]"
            >
              <div className="p-3 sm:p-4 border-b border-[#1a1a1a] flex items-center justify-between bg-black/50">
                <div className="flex items-center gap-2">
                  <Box className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#00ff41]" />
                  <h2 className="text-[10px] sm:text-xs font-bold uppercase tracking-widest">Sandbox Output</h2>
                </div>
                <button 
                  onClick={() => setSandboxOutput(null)}
                  className="p-1.5 hover:bg-[#1a1a1a] rounded transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4 font-mono text-[10px] sm:text-xs">
                <div className="space-y-1">
                  <div className="text-[9px] sm:text-[10px] text-[#00ff41]/40 uppercase">Source Code</div>
                  <pre className="p-2 sm:p-3 bg-black border border-[#1a1a1a] rounded text-[#00ff41]/60 overflow-x-auto text-[10px] sm:text-xs">
                    <code>{sandboxOutput.code}</code>
                  </pre>
                </div>
                <div className="space-y-1">
                  <div className="text-[9px] sm:text-[10px] text-[#00ff41]/40 uppercase">Execution Log</div>
                  <div className={cn(
                    "p-2 sm:p-3 rounded border whitespace-pre-wrap min-h-[100px] text-[10px] sm:text-xs",
                    sandboxOutput.type === 'error' ? "bg-red-500/5 border-red-500/20 text-red-400" : "bg-[#00ff41]/5 border-[#00ff41]/20 text-[#00ff41]"
                  )}>
                    {sandboxOutput.output}
                  </div>
                </div>
              </div>
              <div className="p-3 sm:p-4 border-t border-[#1a1a1a] bg-black/30 text-[9px] sm:text-[10px] text-[#00ff41]/40 flex items-center justify-between">
                <span>RUNTIME: {sandboxOutput.type.toUpperCase()}</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> INTEGRITY_VERIFIED</span>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      <footer className="p-3 sm:p-4 border-t border-[#1a1a1a] bg-black/50 backdrop-blur-md relative z-30">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative">
          {/* Auto-suggestions Dropdown */}
          <AnimatePresence>
            {showSuggestions && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full left-0 w-full mb-2 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg overflow-hidden shadow-[0_-10px_30px_rgba(0,0,0,0.5)] z-50"
              >
                <div className="p-2 border-b border-[#1a1a1a] bg-black/50 flex items-center justify-between">
                  <span className="text-[8px] sm:text-[10px] text-[#00ff41]/40 uppercase tracking-widest font-bold flex items-center gap-1.5">
                    <Terminal className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Command Suggestions
                  </span>
                  <span className="text-[7px] sm:text-[8px] text-[#00ff41]/20 uppercase">TAB/Arrows to navigate</span>
                </div>
                <div className="max-h-48 overflow-y-auto">
                  {autoSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => applySuggestion(suggestion)}
                      onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                      className={cn(
                        "w-full text-left px-4 py-2 text-[10px] sm:text-xs transition-all flex items-center justify-between group",
                        selectedSuggestionIndex === idx ? "bg-[#00ff41]/10 text-[#00ff41]" : "text-[#00ff41]/60 hover:bg-[#00ff41]/5"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <ChevronRight className={cn("w-3 h-3 transition-transform", selectedSuggestionIndex === idx ? "translate-x-0" : "-translate-x-2 opacity-0")} />
                        {suggestion}
                      </span>
                      <span className="text-[8px] opacity-0 group-hover:opacity-100 text-[#00ff41]/40 uppercase">Select</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="RECON PARAMETERS..."
            className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg py-3 sm:py-4 pl-4 pr-12 sm:pr-14 focus:outline-none focus:border-[#00ff41]/50 focus:ring-1 focus:ring-[#00ff41]/20 transition-all placeholder:text-[#00ff41]/20 text-xs sm:text-sm"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 p-1.5 sm:p-2 bg-[#00ff41]/10 hover:bg-[#00ff41]/20 text-[#00ff41] rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed border border-[#00ff41]/30"
          >
            {isLoading ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <Send className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
        </form>
        <div className="mt-2 text-center flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-4">
          <p className="text-[7px] sm:text-[8px] text-[#00ff41]/20 uppercase tracking-[0.1em] sm:tracking-[0.2em]">
            Authorized Personnel Only // Encrypted Session
          </p>
          {isSandboxActive && (
            <div className="flex items-center gap-1 text-[7px] sm:text-[8px] text-[#00ff41]/40 uppercase">
              <CheckCircle2 className="w-2 h-2" /> Sandbox Verified
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
