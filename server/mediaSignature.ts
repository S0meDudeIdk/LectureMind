import { fail } from './errors';

/** Header checks reject obvious type spoofing; they do not certify a decodable recording. */
export function validateMediaSignature(bytes: Buffer, mime: string) {
  const ascii = (offset:number,text:string)=>bytes.toString('ascii',offset,offset+text.length)===text;
  const sync = bytes.length>=2 && bytes[0]===255 && (bytes[1]&224)===224;
  let matches=false;
  if(mime==='audio/mpeg') matches=ascii(0,'ID3')||sync;
  else if(mime==='audio/aac') matches=sync;
  else if(['audio/wav','audio/x-wav'].includes(mime)) matches=ascii(0,'RIFF')&&ascii(8,'WAVE');
  else if(mime==='audio/flac') matches=ascii(0,'fLaC');
  else if(mime==='audio/ogg') matches=ascii(0,'OggS');
  else if(mime.endsWith('/webm')) matches=bytes.subarray(0,4).equals(Buffer.from([26,69,223,163]));
  else if(['audio/mp4','video/mp4','video/quicktime'].includes(mime)) matches=['ftyp','moov','mdat','wide'].some(atom=>ascii(4,atom));
  if(!matches) fail(400,'INVALID_MEDIA_SIGNATURE','Recording header does not match its declared media type.');
}
