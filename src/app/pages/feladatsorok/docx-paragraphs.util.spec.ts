import { deflateRawSync } from 'node:zlib';
import { documentParagraphs, readDocxParagraphs, readZipEntry } from './docx-paragraphs.util';
import { buildDocx, buildZip, documentXml, para } from './docx-paragraphs.testing';

const enc = (s: string) => new TextEncoder().encode(s);

describe('docx-paragraphs.util', () => {
  it('a szerver számozása: táblázatcellák is, szövegdoboz nem; saját szövegrészek, törölt nélkül; tabulátor/sortörés/oldaltörés', () => {
    const xml = documentXml(
      para('Cím') +
        '<w:tbl><w:tr><w:tc>' + para('Nap') + '</w:tc><w:tc>' + para('Program') + '</w:tc></w:tr></w:tbl>' +
        '<w:p><w:r><w:t>Előtte</w:t></w:r><w:r><w:drawing><wps:txbx xmlns:wps="x"><w:txbxContent>' + para('Dobozban') +
        '</w:txbxContent></wps:txbx></w:drawing></w:r><w:r><w:tab/><w:t>utána</w:t><w:br/><w:t>új sor</w:t><w:br w:type="page"/><w:noBreakHyphen/></w:r></w:p>' +
        '<w:p><w:del><w:r><w:delText>törölt</w:delText></w:r></w:del><w:ins><w:r><w:t>beszúrt</w:t></w:r></w:ins>' +
        '<w:hyperlink><w:r><w:t> link</w:t></w:r></w:hyperlink></w:p>' +
        '<w:p/>',
    );
    expect(documentParagraphs(xml)).toEqual(['Cím', 'Nap', 'Program', 'Előtte\tutána\núj sor\f-', 'beszúrt link', '']);
  });

  it('tárolt és deflate-tel tömörített bejegyzést is olvas; a fő részt a _rels/.rels mondja meg', async () => {
    const rels =
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="/word/document2.xml"/></Relationships>';
    const zip = buildZip([
      { name: '_rels/.rels', data: enc(rels) },
      { name: 'word/document2.xml', data: new Uint8Array(deflateRawSync(enc(documentXml(para('Első') + para('Második'))))), method: 8 },
    ]);
    expect(await readDocxParagraphs(zip)).toEqual(['Első', 'Második']);
    expect(await readZipEntry(zip, 'nincs.xml')).toBeNull();
  });

  it('a tesztsegéd .docx-e és a hibás fájl', async () => {
    expect(await readDocxParagraphs(buildDocx(['A', 'B']))).toEqual(['A', 'B']);
    await expect(readDocxParagraphs(enc('nem zip').buffer as ArrayBuffer)).rejects.toThrow();
    await expect(readDocxParagraphs(buildZip([{ name: 'xl/workbook.xml', data: enc('<x/>') }]))).rejects.toThrow();
  });
});
