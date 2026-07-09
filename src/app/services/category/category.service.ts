import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PublicCategoryDto } from '../../models/category.model';

/** A tantárgyi kategória-választóhoz — ugyanaz a publikus, auth nélküli végpont, amit a diák-app is használ. */
@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly http = inject(HttpClient);

  getAll(): Observable<PublicCategoryDto[]> {
    return this.http.get<PublicCategoryDto[]>(`${environment.apiUrl}/public/categories`);
  }
}
