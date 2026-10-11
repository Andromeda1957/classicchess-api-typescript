import { ClassicChessClient, type PublicPlayer } from 'classicchess-sdk';

async function commonJsConsumer(): Promise<PublicPlayer[]> {
  return (await new ClassicChessClient().publicPlayers()).results;
}
void commonJsConsumer;
