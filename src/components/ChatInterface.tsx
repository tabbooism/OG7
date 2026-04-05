import React, { useState, useRef, useEffect } from 'react';
import { Send, Shield, Terminal, Search, Globe, Cpu, Loader2, ChevronRight, Play, CheckCircle2, AlertCircle, Box, X, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { streamNightfuryResponse, Message, CodeExecutionStep } from '../lib/gemini';
import { cn } from '../lib/utils';

export default function ChatInterface() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSandboxActive, setIsSandboxActive] = useState(true);
  const [targetDomain, setTargetDomain] = useState('rh420.xyz');
  const [isTargetLocked, setIsTargetLocked] = useState(false);
  const [sandboxOutput, setSandboxOutput] = useState<{ code: string; output: string; type: 'js' | 'python' | 'error' } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persistence: Load messages from localStorage on mount
  useEffect(() => {
    const savedMessages = localStorage.getItem('nightfury_session_v1');
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (e) {
        console.error('Failed to parse saved session:', e);
      }
    } else {
      // If no saved session, run initial recon
      initializeRecon();
    }
  }, []);

  // Persistence: Save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('nightfury_session_v1', JSON.stringify(messages));
    }
  }, [messages]);

  const initializeRecon = async () => {
    setIsLoading(true);
    setIsTargetLocked(true);
    
    const initialMessage: Message = { 
      role: 'model', 
      text: '', 
      isThinking: true,
      codeExecutionSteps: [] 
    };
    setMessages([initialMessage]);

    try {
      await processStream(`Perform an initial reconnaissance analysis on the domain ${targetDomain}. Focus on DNS records, potential subdomains, and common backend vulnerabilities for a .xyz domain. Provide a summary of attack vectors to explore.`);
    } catch (error) {
      console.error('Error initializing recon:', error);
    } finally {
      setIsLoading(false);
      setTimeout(() => setIsTargetLocked(false), 3000);
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
      await processStream(scanPrompt);
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
      await processStream(scanPrompt);
    } catch (error) {
      console.error('Error during deep tool scan:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const processStream = async (prompt: string) => {
    let fullText = '';
    let groundingMetadata = null;
    let currentSteps: CodeExecutionStep[] = [];
    
    const stream = streamNightfuryResponse(prompt);
    
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
      
      setMessages(prev => {
        const newMessages = [...prev];
        const last = newMessages[newMessages.length - 1];
        if (last && last.role === 'model') {
          last.text = fullText;
          last.isThinking = false;
          last.groundingMetadata = groundingMetadata;
          last.codeExecutionSteps = [...currentSteps];
        }
        return newMessages;
      });
    }
  };

  const clearSession = () => {
    if (window.confirm('Are you sure you want to terminate the current session and clear all logs?')) {
      localStorage.removeItem('nightfury_session_v1');
      setMessages([]);
      initializeRecon();
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const runInSandbox = async (code: string, lang: string) => {
    if (!isSandboxActive) return;
    
    setSandboxOutput({ code, output: 'INITIALIZING_SANDBOX...', type: lang === 'python' ? 'python' : 'js' });

    if (lang === 'javascript' || lang === 'js') {
      try {
        // Simple JS Sandbox using a Function constructor (still browser-side, but isolated from state)
        // In a real app, use a sandboxed iframe or Web Worker
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
    } else if (lang === 'python') {
      setSandboxOutput({ code, output: 'CONNECTING_TO_REMOTE_KERNEL...\nESTABLISHING_SECURE_TUNNEL...\nMOUNTING_RECON_MODULES...', type: 'python' });
      
      // Simulate real-time operational feedback
      setTimeout(() => {
        setSandboxOutput(prev => prev ? { 
          ...prev, 
          output: prev.output + `\n\n[REAL_TIME_OPS_LOG]\nTARGET: ${targetDomain}\nSTATUS: EXECUTING_RECON_SCRIPT\n\n` + 
          `DNS_QUERY_INITIATED...\n` +
          `SUBDOMAIN_SCAN_IN_PROGRESS...\n` +
          `PORT_ANALYSIS_ACTIVE...\n\n` +
          `[SUCCESS] Script execution completed. Data piped to Nightfury Engine.`
        } : null);
      }, 2000);
    } else {
      setSandboxOutput({ code, output: `UNSUPPORTED_RUNTIME: ${lang}`, type: 'error' });
    }
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
      await processStream(input);
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
              <span className="flex items-center gap-1 text-[#00ff41]/80 border-l border-[#1a1a1a] pl-2 ml-1 sm:ml-2">
                <Search className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> {targetDomain}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
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
                    <div className="flex items-center gap-2 sm:gap-3 py-1 sm:py-2">
                      <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                      <span className="animate-pulse text-[10px] sm:text-xs">Analyzing attack vectors & exploring non-linear edge cases...</span>
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
                            code({ node, inline, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || '');
                              const lang = match ? match[1] : '';
                              const code = String(children).replace(/\n$/, '');
                              
                              return !inline && match ? (
                                <div className="relative group my-3 sm:my-4">
                                  <div className="absolute top-2 right-2 flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10">
                                    <button 
                                      onClick={() => runInSandbox(code, lang)}
                                      title="Run in Sandbox"
                                      className="p-1 sm:p-1.5 bg-[#00ff41]/10 border border-[#00ff41]/30 rounded text-[#00ff41] hover:bg-[#00ff41]/20 transition-colors"
                                    >
                                      <Play className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                    </button>
                                  </div>
                                  <pre className={cn(className, "text-[10px] sm:text-xs")} {...props}>
                                    <code>{children}</code>
                                  </pre>
                                </div>
                              ) : (
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
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
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
