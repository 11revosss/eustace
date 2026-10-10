import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useChat } from '../hooks/useChat';
import { supabase } from '../lib/supabase';
import { Loader2, ArrowLeft, Send, Paperclip, Image as ImageIcon, X, File as FileIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { SmoothInput } from '../components/ui/SmoothInput';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

export function ChatPage() {
  const { friendId } = useParams<{ friendId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { messages, loading, sendMessage } = useChat(friendId || '');
  const [friendProfile, setFriendProfile] = useState<any>(null);
  
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch friend's profile details for the header
  useEffect(() => {
    if (!friendId) return;
    const fetchFriend = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('username, display_name, full_name, avatar_url')
        .eq('id', friendId)
        .single();
      setFriendProfile(data);
    };
    fetchFriend();
  }, [friendId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() && !file) return;
    if (isSending) return;

    setIsSending(true);
    try {
      await sendMessage(text.trim() ? text.trim() : null, file);
      setText('');
      setFile(null);
    } catch (err: any) {
      console.error("Failed to send message", err);
      toast.error(err.message || 'Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  if (!user || !friendId) return null;

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] md:h-[calc(100vh-6rem)] bg-background">
      {/* Header */}
      <div className="flex items-center gap-4 p-4 md:p-6 border-b border-border/20 bg-surface/30 backdrop-blur-md shrink-0">
        <button 
          onClick={() => navigate('/friends')}
          className="p-2 hover:bg-surface border border-transparent hover:border-border/30 rounded-xl transition-all text-textMuted hover:text-textMain"
        >
          <ArrowLeft size={20} />
        </button>
        
        {friendProfile ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-border/20 overflow-hidden shrink-0 flex items-center justify-center">
              {friendProfile.avatar_url ? (
                <img src={friendProfile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-textMuted">
                  {(friendProfile.display_name || friendProfile.full_name || friendProfile.username)?.substring(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-textMain leading-tight">
                {friendProfile.display_name || friendProfile.full_name || friendProfile.username}
              </span>
              <span className="text-xs text-textMuted font-medium">@{friendProfile.username}</span>
            </div>
          </div>
        ) : (
          <div className="h-10 flex items-center">
            <Loader2 size={16} className="animate-spin text-textMuted" />
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-accent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50">
            <span className="text-sm font-bold text-textMuted tracking-widest uppercase mb-2">No messages yet</span>
            <span className="text-xs text-textMuted max-w-xs">Start the conversation by sending a message below.</span>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.sender_id === user.id;
            const showAvatar = !isMe && (idx === messages.length - 1 || messages[idx + 1]?.sender_id !== msg.sender_id);
            
            return (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id} 
                className={cn("flex gap-3 max-w-[85%] md:max-w-[70%]", isMe ? "self-end flex-row-reverse" : "self-start")}
              >
                {!isMe && (
                  <div className="w-8 h-8 rounded-full bg-border/20 overflow-hidden shrink-0 flex items-center justify-center self-end">
                    {showAvatar && msg.profiles?.avatar_url ? (
                      <img src={msg.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : showAvatar ? (
                      <span className="text-[10px] font-bold text-textMuted">
                        {(msg.profiles?.display_name || msg.profiles?.username || 'U')?.substring(0, 2).toUpperCase()}
                      </span>
                    ) : null}
                  </div>
                )}
                
                <div className={cn("flex flex-col gap-1", isMe ? "items-end" : "items-start")}>
                  <div className={cn(
                    "px-4 py-2.5 rounded-2xl flex flex-col gap-2",
                    isMe 
                      ? "bg-accent text-background rounded-br-sm" 
                      : "bg-surface border border-border/30 text-textMain rounded-bl-sm"
                  )}>
                    {msg.media_url && (
                      <div className="rounded-lg overflow-hidden max-w-sm">
                        {msg.media_type === 'video' ? (
                          <video src={msg.media_url} controls className="max-w-full max-h-64 object-contain" />
                        ) : msg.media_type === 'document' ? (
                          <a href={msg.media_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 bg-background/20 hover:bg-background/30 rounded-lg transition-colors border border-border/10">
                            <FileIcon size={24} className={isMe ? "text-background/80" : "text-accent"} />
                            <span className="text-sm font-medium underline-offset-2 hover:underline truncate max-w-[200px]">View Document</span>
                          </a>
                        ) : (
                          <a href={msg.media_url} target="_blank" rel="noreferrer">
                            <img src={msg.media_url} alt="Attachment" className="max-w-full max-h-64 object-cover hover:opacity-90 transition-opacity" />
                          </a>
                        )}
                      </div>
                    )}
                    {msg.text_content && (
                      <span className={cn("text-sm whitespace-pre-wrap leading-relaxed font-medium", isMe ? "text-background/90" : "text-textMain/90")}>
                        {msg.text_content}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-textMuted/60 uppercase tracking-wider px-1">
                    {format(new Date(msg.created_at), 'h:mm a')}
                  </span>
                </div>
              </motion.div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 md:p-6 border-t border-border/20 bg-background shrink-0">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto flex flex-col gap-3">
          <AnimatePresence>
            {file && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 px-4 py-2 bg-surface border border-border/30 rounded-xl w-fit"
              >
                <ImageIcon size={16} className="text-accent" />
                <span className="text-xs font-medium text-textMain truncate max-w-[200px]">{file.name}</span>
                <button type="button" onClick={() => setFile(null)} className="p-1 text-textMuted hover:text-red-400 transition-colors">
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3.5 bg-surface border border-border/30 hover:border-textMuted/50 text-textMuted hover:text-textMain rounded-2xl transition-all"
            >
              <Paperclip size={20} />
            </button>
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef}
              accept="*/*"
              onChange={handleFileChange}
            />
            
            <div className="flex-1">
              <SmoothInput
                type="text"
                placeholder="Message..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full bg-surface border border-border/30 rounded-2xl py-3.5 px-5 text-sm font-medium text-textMain focus:outline-none focus:border-accent transition-colors"
                wrapperClassName="!p-0 !max-w-none"
              />
            </div>

            <button
              type="submit"
              disabled={(!text.trim() && !file) || isSending}
              className={cn(
                "p-3.5 rounded-2xl flex items-center justify-center transition-all",
                (!text.trim() && !file) || isSending
                  ? "bg-surface border border-border/30 text-textMuted cursor-not-allowed"
                  : "bg-accent text-background shadow-lg shadow-accent/20 hover:scale-105 active:scale-95"
              )}
            >
              {isSending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} className="ml-1" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
