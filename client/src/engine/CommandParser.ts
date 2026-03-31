interface ParsedCommand {
  command: string;
  args: string[];
  raw: string;
}

export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const withoutSlash = trimmed.slice(1);
  const spaceIndex = withoutSlash.indexOf(' ');

  if (spaceIndex === -1) {
    return {
      command: withoutSlash.toUpperCase(),
      args: [],
      raw: trimmed,
    };
  }

  const command = withoutSlash.slice(0, spaceIndex).toUpperCase();
  const rest = withoutSlash.slice(spaceIndex + 1);

  // Parse args based on command type
  switch (command) {
    case 'MSG':
    case 'NOTICE':
    case 'QUERY': {
      const targetSpace = rest.indexOf(' ');
      if (targetSpace === -1) return { command, args: [rest], raw: trimmed };
      return {
        command,
        args: [rest.slice(0, targetSpace), rest.slice(targetSpace + 1)],
        raw: trimmed,
      };
    }
    case 'KICK': {
      const parts = rest.split(' ');
      const channel = parts[0];
      const nick = parts[1];
      const reason = parts.slice(2).join(' ') || undefined;
      const args = [channel, nick];
      if (reason) args.push(reason);
      return { command, args, raw: trimmed };
    }
    case 'MODE': {
      const parts = rest.split(' ');
      return { command, args: parts, raw: trimmed };
    }
    case 'JOIN':
    case 'PART':
    case 'TOPIC':
    case 'NICK':
    case 'QUIT':
    case 'AWAY':
    case 'WHOIS':
    case 'LIST':
    case 'ME':
    case 'SERVER': {
      return { command, args: rest ? rest.split(' ') : [], raw: trimmed };
    }
    default:
      return { command, args: rest ? [rest] : [], raw: trimmed };
  }
}
