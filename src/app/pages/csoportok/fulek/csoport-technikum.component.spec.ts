import { Component, input, output } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CsoportTechnikumComponent } from './csoport-technikum.component';
import { VizsgareszTerkepComponent } from '../../technikum/vizsgaresz-terkep.component';
import { CsoportCsapatokComponent } from '../../csapatok/csoport-csapatok.component';
import { VideoHelpComponent } from '../../../shared/video-help/video-help.component';
import { ElmeletiDolgozatKiadasComponent } from '../../technikum/elmeleti-dolgozat-kiadas.component';

@Component({ selector: 'app-elmeleti-dolgozat-kiadas', template: '' })
class ElmeletiStub {
  readonly groupId = input.required<number>();
}

@Component({ selector: 'app-vizsgaresz-terkep', template: '' })
class TerkepStub {
  readonly groupId = input.required<number>();
  readonly unavailable = output<void>();
}

@Component({ selector: 'app-csoport-csapatok', template: '' })
class CsapatokStub {
  readonly groupId = input.required<number>();
  readonly unavailable = output<void>();
}

@Component({ selector: 'app-video-help', template: '' })
class VideoHelpStub {
  readonly video = input.required<string>();
}

describe('CsoportTechnikumComponent', () => {
  function setup(showTerkep: boolean, showCsapatok: boolean) {
    TestBed.configureTestingModule({ imports: [CsoportTechnikumComponent] }).overrideComponent(CsoportTechnikumComponent, {
      remove: { imports: [VizsgareszTerkepComponent, CsoportCsapatokComponent, VideoHelpComponent, ElmeletiDolgozatKiadasComponent] },
      add: { imports: [TerkepStub, CsapatokStub, VideoHelpStub, ElmeletiStub] },
    });
    const fixture = TestBed.createComponent(CsoportTechnikumComponent);
    fixture.componentRef.setInput('groupId', 7);
    fixture.componentRef.setInput('showTerkep', showTerkep);
    fixture.componentRef.setInput('showCsapatok', showCsapatok);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('mindkét blokk látszik: a szakasz-horgonyok (#vizsgaresz-terkep, #csapatok) és a csoport-azonosító átadása', () => {
    const { fixture, el } = setup(true, true);
    expect(el.querySelector('#vizsgaresz-terkep')?.textContent).toContain('Vizsgarész-térkép');
    expect(el.querySelector('#csapatok')?.textContent).toContain('Csapatok');
    expect(fixture.debugElement.query(By.directive(TerkepStub)).componentInstance.groupId()).toBe(7);
    expect(fixture.debugElement.query(By.directive(CsapatokStub)).componentInstance.groupId()).toBe(7);
  });

  it('csak a szülő által engedélyezett blokk jelenik meg', () => {
    const terkepOnly = setup(true, false);
    expect(terkepOnly.el.querySelector('#vizsgaresz-terkep')).not.toBeNull();
    expect(terkepOnly.el.querySelector('#csapatok')).toBeNull();
    TestBed.resetTestingModule();

    const csapatokOnly = setup(false, true);
    expect(csapatokOnly.el.querySelector('#vizsgaresz-terkep')).toBeNull();
    expect(csapatokOnly.fixture.debugElement.query(By.directive(CsapatokStub))).not.toBeNull();
  });

  it('a térkép és a csapatok 404-e (unavailable) a megfelelő kimeneten jut a szülőhöz', () => {
    const { fixture } = setup(true, true);
    const terkep = vi.fn();
    const csapatok = vi.fn();
    fixture.componentInstance.terkepUnavailable.subscribe(terkep);
    fixture.componentInstance.csapatokUnavailable.subscribe(csapatok);

    (fixture.debugElement.query(By.directive(TerkepStub)).componentInstance as TerkepStub).unavailable.emit();
    expect(terkep).toHaveBeenCalledTimes(1);
    expect(csapatok).not.toHaveBeenCalled();

    (fixture.debugElement.query(By.directive(CsapatokStub)).componentInstance as CsapatokStub).unavailable.emit();
    expect(csapatok).toHaveBeenCalledTimes(1);
  });
});
