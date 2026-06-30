export async function fetchEmailsFromGmail(accessToken: string, lastSyncTimestamp?: string | null): Promise<string[]> {
  try {
    const afterDate = lastSyncTimestamp 
      ? new Date(lastSyncTimestamp).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        })
      : null;

    const query = afterDate 
      ? `deadline OR due OR submission OR reminder after:${afterDate}`
      : `deadline OR due OR submission OR reminder`;

    // Fetch list of emails matching deadlines
    const listResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=${encodeURIComponent(query)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    
    if (!listResponse.ok) {
      if (listResponse.status === 401) {
        throw new Error("UNAUTHORIZED");
      }
      if (listResponse.status === 403) {
        throw new Error("Gmail access denied. Please sign out and sign in again, making sure to allow Gmail permission.");
      }
      throw new Error(`Gmail API returned status ${listResponse.status}`);
    }
    
    const listData = await listResponse.json();
    if (!listData.messages || listData.messages.length === 0) return [];

    // Fetch each email's content
    const emailPromises = listData.messages.slice(0, 10).map(async (msg: any) => {
      try {
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=subject&metadataHeaders=date`,
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        if (!msgResponse.ok) return '';
        const msgData = await msgResponse.json();
        
        const headers = msgData.payload?.headers || [];
        const subject = headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || '';
        const date = headers.find((h: any) => h.name?.toLowerCase() === 'date')?.value || '';
        const snippet = msgData.snippet || '';
        
        return `Subject: ${subject}\nDate: ${date}\nPreview: ${snippet}`;
      } catch (err) {
        console.error(`Gmail message detail fetch error for ${msg.id}:`, err);
        return '';
      }
    });

    const emails = await Promise.all(emailPromises);
    return emails.filter((e): e is string => e !== null && e.length > 0);
  } catch (error: any) {
    console.error('Gmail fetch error:', error);
    throw error;
  }
}

export async function parseEmailsWithGemini(emailTexts: string[]): Promise<any[]> {
  try {
    const res = await fetch("/api/gemini/parse-gmail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emails: emailTexts })
    });
    
    if (!res.ok) {
      throw new Error("Could not read emails clearly. Try syncing again.");
    }
    
    const data = await res.json();
    let text = data.text || "";
    
    // Remove markdown code blocks
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    // Extract just the JSON array
    const startIndex = text.indexOf('[');
    const endIndex = text.lastIndexOf(']');
    
    if (startIndex === -1 || endIndex === -1) {
      console.log('Gemini did not return a JSON array');
      return [];
    }
    
    text = text.substring(startIndex, endIndex + 1);
    
    const parsed = JSON.parse(text);
    
    // Validate each task
    return parsed.filter((task: any) => {
      if (!task.name || task.name.length < 3) return false;
      if (!task.deadline) return false;
      const date = new Date(task.deadline);
      if (isNaN(date.getTime())) return false;
      if (date < new Date()) return false;
      return true;
    });

  } catch (error: any) {
    console.error('Gemini parse error:', error);
    throw new Error("Could not read emails clearly. Try syncing again.");
  }
}
