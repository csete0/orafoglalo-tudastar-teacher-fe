import { TestBed } from '@angular/core/testing';
import { MAX_REQUIRED_SKILLS, TeacherSkillDto } from '../../models/teacher-content.model';
import { SkillPickerComponent } from './skill-picker.component';

describe('SkillPickerComponent', () => {
  const skills: TeacherSkillDto[] = Array.from({ length: MAX_REQUIRED_SKILLS + 2 }, (_, i) => ({
    id: i + 1,
    name: `Téma ${i + 1}`,
    area: i % 2 ? 'adatbazis' : 'programozas',
  }));

  function create(selected: number[] = []) {
    const fixture = TestBed.createComponent(SkillPickerComponent);
    fixture.componentRef.setInput('skills', skills);
    fixture.componentRef.setInput('selected', selected);
    fixture.detectChanges();
    return fixture;
  }

  it('területenként csoportosít', () => {
    const fixture = create();
    const legends = [...fixture.nativeElement.querySelectorAll('legend')].map((l: HTMLElement) => l.textContent?.trim());
    expect(legends).toEqual(['Programozás', 'SQL / adatbázis']);
  });

  it('a kattintás ki-be kapcsolja a témát', () => {
    const fixture = create([2]);
    const c = fixture.componentInstance;
    c.toggle(1);
    expect(c.selected()).toEqual([2, 1]);
    c.toggle(2);
    expect(c.selected()).toEqual([1]);
  });

  it('a maximumon túl nem enged újat, a többi jelölőnégyzet letiltva', () => {
    const full = skills.slice(0, MAX_REQUIRED_SKILLS).map((s) => s.id);
    const fixture = create(full);
    fixture.componentInstance.toggle(MAX_REQUIRED_SKILLS + 1);
    expect(fixture.componentInstance.selected()).toEqual(full);
    fixture.detectChanges();
    const extra: HTMLInputElement = fixture.nativeElement.querySelector(`[data-testid="skill-${MAX_REQUIRED_SKILLS + 1}"]`);
    expect(extra.disabled).toBe(true);
  });
});
