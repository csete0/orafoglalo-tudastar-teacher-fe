import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SchoolLicenseOverviewDto } from '../../models/school-license.model';
import { IconComponent } from '../../shared/icon/icon.component';

/** Igazgatói licenc-nézet (intézmény „Licenc” fül): licencenként keret, érvényesség, csoportok és foglalt helyek. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-intezmeny-licenc',
  host: { class: 'block' },
  imports: [DatePipe, IconComponent],
  template: `
    @for (lic of licenses(); track lic.licenseId) {
      <div class="card p-5 mb-6" data-testid="license-overview-card">
        <div class="flex flex-wrap gap-4 mb-4">
          <div class="flex flex-col items-center bg-bg-element rounded-xl p-3 min-w-24">
            <span class="text-xs text-text-muted mb-1">Tier</span>
            <span class="font-bold capitalize">{{ lic.tier }}</span>
          </div>
          <div class="flex flex-col items-center bg-bg-element rounded-xl p-3 min-w-24">
            <span class="text-xs text-text-muted mb-1">Helyek</span>
            <span class="font-bold">{{ lic.usedSeats }} / {{ lic.capacity }}</span>
          </div>
          <div class="flex flex-col items-center bg-bg-element rounded-xl p-3 min-w-24">
            <span class="text-xs text-text-muted mb-1">Érvényes</span>
            <span class="font-bold text-sm">{{ lic.validFrom | date:'yyyy.MM.dd' }} – {{ lic.validTo | date:'yyyy.MM.dd' }}</span>
          </div>
        </div>

        @if (lic.groups.length > 0) {
          <h3 class="font-semibold text-sm mb-2">Csoportok szerinti megoszlás</h3>
          <div class="data-table-scroll mb-4">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Csoport</th>
                  <th>Tanár</th>
                  <th class="text-right">Aktív helyek</th>
                </tr>
              </thead>
              <tbody>
                @for (g of lic.groups; track g.groupId) {
                  <tr>
                    <td>{{ g.groupName }}</td>
                    <td class="text-text-muted">{{ g.teacherName }}</td>
                    <td class="num text-right">{{ g.activeSeatCount }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        @if (lic.seats.length > 0) {
          <h3 class="font-semibold text-sm mb-2">Diákok ({{ lic.seats.length }} aktív hely)</h3>
          <div class="data-table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Diák</th>
                  <th>Csoportok</th>
                  <th>Utolsó aktivitás</th>
                </tr>
              </thead>
              <tbody>
                @for (seat of lic.seats; track seat.userId) {
                  <tr>
                    <td class="whitespace-nowrap">{{ seat.studentName }}</td>
                    <td class="text-text-muted">{{ seat.groupNames.join(', ') || '–' }}</td>
                    <td class="num whitespace-nowrap text-text-muted">{{ seat.lastActivityAt | date:'yyyy.MM.dd HH:mm' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="text-text-muted text-sm text-center py-4">Nincs aktív helyfoglalás.</p>
        }
      </div>
    } @empty {
      <div class="flex flex-col items-center py-10 gap-3">
        <div class="icon-tile icon-tile-neutral">
          <app-icon name="document" class="w-6 h-6 block" />
        </div>
        <p class="font-semibold">Az intézményhez nincs aktív licenc.</p>
      </div>
    }
  `,
})
export class IntezmenyLicencComponent {
  readonly licenses = input.required<readonly SchoolLicenseOverviewDto[]>();
}
