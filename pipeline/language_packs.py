# /// script
# requires-python = ">=3.11"
# dependencies = ["ctranslate2>=4.5,<5", "sentencepiece>=0.2,<1", "opencc-python-reimplemented>=0.1.7,<1"]
# ///
"""Compile offline interface dictionaries. The optional translation model runs only at build time."""

import argparse
import ast
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ['research', 'space-lab', 'history-lab', 'markets', 'wishlist']
AUTHORED = ['zh-CN', 'en', 'zh-TW', 'es', 'fr', 'ja', 'ko', 'ar']
EXTRA = ['de', 'pt', 'hi', 'ru', 'id', 'it', 'tr', 'vi', 'bn', 'uk', 'pl', 'fa', 'ur', 'sw', 'nl', 'th']
MODEL = 'jncraton/m2m100_418M-ct2-int8@7c1b2620a4e58dacecbd8bf89cfd6da7eb9eb7b0'
# Proper names are reviewed separately from prose translation: preserve the shared brand.
BRAND = {
    'de':'Orbis Atlas', 'pt':'Orbis Atlas', 'hi':'ऑर्बिस एटलस', 'ru':'Орбис Атлас',
    'id':'Orbis Atlas', 'it':'Orbis Atlas', 'tr':'Orbis Atlas', 'vi':'Orbis Atlas',
    'bn':'অরবিস অ্যাটলাস', 'uk':'Орбіс Атлас', 'pl':'Orbis Atlas', 'fa':'اطلس اوربیس',
    'ur':'اوربِس اٹلس', 'sw':'Orbis Atlas', 'nl':'Orbis Atlas', 'th':'ออร์บิส แอตลาส',
}
QUOTED = r'''(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")'''
PAIR = re.compile(fr'(?P<zh>{QUOTED})\s*,\s*(?:en\s*:\s*)?(?P<en>{QUOTED})')
HAN = re.compile(r'[\u3400-\u9fff]')
TOKENS = re.compile(r'(\{[A-Za-z][A-Za-z0-9_]*\})')


def dictionaries():
    command = """const rows=[];for(const n of ['shell','geography','profiles','explorer','simulation','council','standards']){const m=await import('./web/i18n/'+n+'.js');rows.push(...m.default)}console.log(JSON.stringify(rows));"""
    authored = json.loads(subprocess.check_output(['node','--input-type=module','-e',command],cwd=ROOT))
    base = {row[0]: row[1] for row in authored if len(row)>1}
    studio = {'更多研究':'Research','研究档案':'Research archive','观测数据加载中':'Loading observations', '重试':'Retry'}
    def pair(zh,en):
        if isinstance(zh,str) and isinstance(en,str) and HAN.search(zh) and not HAN.search(en) and en.strip():
            studio[zh] = en
    for name in RESEARCH:
        p=ROOT/'web/js'/f'{name}.js'
        if not p.exists(): continue
        source = p.read_text()
        # Look ahead for overlapping alternating columns, such as category-id / Chinese / English.
        for match in re.finditer(r'(?='+PAIR.pattern+')',source):
            try: pair(ast.literal_eval(match['zh']),ast.literal_eval(match['en']))
            except (ValueError,SyntaxError): pass
    def walk(item):
        if isinstance(item,dict):
            pair(item.get('zh'),item.get('en'))
            for child in item.values(): walk(child)
        elif isinstance(item,list):
            for child in item:
                if isinstance(child,(list,dict)): walk(child)
    for path in [ROOT/'web/data/space/ephemeris.json', ROOT/'web/data/history/catalog.json', ROOT/'web/data/history/evidence.json',ROOT/'web/data/history/sources.json']:
        if path.exists():walk(json.loads(path.read_text()))
    return base,studio


def split_text(text):
    return [part for part in TOKENS.split(text) if part]


def translate(model, spm, language, strings, cache):
    import ctranslate2
    if model is None: raise ValueError('Supply the pinned CTranslate2 model directory')
    target = ['__'+language+'__']
    missing = sorted({part.strip() for text in strings for part in split_text(text)
                      if part.strip() and not TOKENS.fullmatch(part) and re.search('[A-Za-z]',part) and part.strip() not in cache},key=len)
    if not missing: return
    translator = ctranslate2.Translator(str(model),device='cpu',compute_type='int8',intra_threads=5,inter_threads=1)
    for start in range(0,len(missing),32):
        batch=missing[start:start+32]
        source=[['__en__',*spm.encode(s,out_type=str),'</s>'] for s in batch]
        result=translator.translate_batch(source,target_prefix=[target for _ in batch],beam_size=2,max_batch_size=16,
                                          max_decoding_length=240,repetition_penalty=1.06)
        for text,item in zip(batch,result,strict=True):
            pieces=item.hypotheses[0]
            translated=spm.decode(pieces[1:] if pieces[:1]==target else pieces).strip()
            cache[text]=translated or text


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model',type=Path,required=True)
    parser.add_argument('--cache',type=Path,default=ROOT/'.cache/i18n')
    parser.add_argument('--languages',nargs='*',default=AUTHORED[2:]+EXTRA)
    args=parser.parse_args()
    import sentencepiece
    from opencc import OpenCC
    spm=sentencepiece.SentencePieceProcessor(model_file=str(args.model/'sentencepiece.bpe.model'))
    traditional=OpenCC('s2twp')
    output=ROOT/'web/locales'
    output.mkdir(exist_ok=True);args.cache.mkdir(exist_ok=True,parents=True)
    base,studio=dictionaries()
    for language in args.languages:
        if language not in AUTHORED+EXTRA:raise ValueError(language)
        rows = studio if language in AUTHORED else base | studio
        local_cache=args.cache/f'{language}.json'
        cache=json.loads(local_cache.read_text()) if local_cache.exists() else {}
        if language not in ('zh-TW','en','zh-CN'):
            translate(args.model,spm,language,rows.values(),cache)
            local_cache.write_text(json.dumps(cache,ensure_ascii=False))
        translated={}
        for zh,en in rows.items():
            if language=='zh-TW':value=traditional.convert(zh)
            elif language=='zh-CN':value=zh
            elif language=='en':value=en
            else:
                pieces=[]
                for part in split_text(en):
                    if TOKENS.fullmatch(part) or part.strip() not in cache:pieces.append(part);continue
                    pieces.append((' ' if part.startswith(' ') else '') + cache[part.strip()] + (' ' if part.endswith(' ') else ''))
                value=''.join(pieces)
            if language in BRAND and zh in ('寰宇图志', '寰宇图志 · Orbis Atlas'):
                value = BRAND[language]
            if sorted(TOKENS.findall(value))!=sorted(TOKENS.findall(en)) and language!='zh-TW':raise ValueError((language,en,value))
            translated[zh]=value
        document={'locale':language,'method':'OpenCC' if language=='zh-TW' else 'M2M100 offline translation',
                  'model':MODEL,'entries':translated,'englishHash':hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest()}
        (output/f'{language}.json').write_text(json.dumps(document,ensure_ascii=False,separators=(',',':'))+'\n')
        print(language,len(translated),'entries',flush=True)


if __name__=='__main__': main()
