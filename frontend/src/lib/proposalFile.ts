/** Client-side checks for proposal uploads. The server re-validates type, size and file header. */

export const PROPOSAL_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt";
const PROPOSAL_EXTS = PROPOSAL_ACCEPT.split(",");
const MAX_PROPOSAL_BYTES = 25 * 1024 * 1024;

export function validateProposalFile(f: File): string | null {
  const name = f.name.toLowerCase();
  if (!PROPOSAL_EXTS.some((ext) => name.endsWith(ext))) {
    return "Use a PDF, Word, Excel, PowerPoint or text file.";
  }
  if (f.size === 0) return "That file is empty.";
  if (f.size > MAX_PROPOSAL_BYTES) return "Files can be at most 25 MB.";
  return null;
}
