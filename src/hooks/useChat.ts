import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  text_content: string | null;
  media_url: string | null;
  media_type: 'image' | 'video' | 'document' | null;
  created_at: string;
  profiles?: {
    username: string;
    display_name: string | null;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export function useChat(friendId: string) {
  const { user } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // 1. Get or create conversation between current user and friendId
  const getOrCreateConversation = useCallback(async () => {
    if (!user || !friendId) return null;

    try {
      const user1 = user.id < friendId ? user.id : friendId;
      const user2 = user.id < friendId ? friendId : user.id;

      // Check if exists
      const { data: existing, error: fetchError } = await supabase
        .from('conversations')
        .select('id')
        .eq('user1_id', user1)
        .eq('user2_id', user2)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existing) {
        setConversationId(existing.id);
        return existing.id;
      }

      // Create new
      const { data: newConv, error: insertError } = await supabase
        .from('conversations')
        .insert({ user1_id: user1, user2_id: user2 })
        .select('id')
        .single();

      if (insertError) throw insertError;
      
      setConversationId(newConv.id);
      return newConv.id;
    } catch (err: any) {
      console.error("Error getting conversation:", err);
      setError(err);
      return null;
    }
  }, [user, friendId]);

  // 2. Fetch messages for the conversation
  const fetchMessages = useCallback(async (convId: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          profiles:sender_id (username, display_name, full_name, avatar_url)
        `)
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err: any) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 3. Setup Supabase Realtime Subscription
  useEffect(() => {
    let channel: any;

    const setupChat = async () => {
      setLoading(true);
      const convId = await getOrCreateConversation();
      if (!convId) {
        setLoading(false);
        return;
      }

      await fetchMessages(convId);

      // Subscribe to inserts on messages table for this conversation
      channel = supabase
        .channel(`chat_${convId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${convId}`,
          },
          async (payload) => {
            // We need to fetch the profile data for the new message
            const { data: profile } = await supabase
              .from('profiles')
              .select('username, display_name, full_name, avatar_url')
              .eq('id', payload.new.sender_id)
              .single();

            const newMessage = { ...payload.new, profiles: profile } as ChatMessage;
            
            setMessages((prev) => {
              // Prevent duplicates if we already added it optimistically
              if (prev.some(m => m.id === newMessage.id)) return prev;
              return [...prev, newMessage];
            });
          }
        )
        .subscribe();
    };

    setupChat();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user, friendId, getOrCreateConversation, fetchMessages]);

  // 4. Send a message
  const sendMessage = async (textContent: string | null, file: File | null) => {
    if (!user || !conversationId) return null;
    if (!textContent && !file) return null;

    let mediaUrl = null;
    let mediaType = null;

    if (file) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${conversationId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(filePath, file);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
      mediaUrl = data.publicUrl;
      if (file.type.startsWith('video/')) {
        mediaType = 'video';
      } else if (file.type.startsWith('image/')) {
        mediaType = 'image';
      } else {
        mediaType = 'document';
      }
    }

    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        text_content: textContent,
        media_url: mediaUrl,
        media_type: mediaType
      });

    if (insertError) {
      console.error("Message insert error:", insertError);
      throw insertError;
    }
  };

  return { messages, loading, error, sendMessage, conversationId };
}
