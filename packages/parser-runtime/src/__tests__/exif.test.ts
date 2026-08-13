import piexif from 'piexifjs'
import { describe, expect, it } from 'vitest'
import { stripExifCategories } from '../conversion/exif'
import {
  createExifJpegDataUrl,
  FIXTURE_ARTIST,
  FIXTURE_COPYRIGHT,
  FIXTURE_MAKE,
  FIXTURE_MODEL,
  FIXTURE_SOFTWARE,
  MALFORMED_JPEG_DATA_URL,
  PNG_DATA_URL,
  WEBP_DATA_URL
} from './fixtures/exif'

describe('stripExifCategories', () => {
  it('removes geolocation while keeping camera Make', () => {
    const stripped = stripExifCategories(createExifJpegDataUrl(), ['geolocation'])
    const exif = piexif.load(stripped)

    expect(exif.GPS?.[piexif.GPSIFD.GPSLatitudeRef]).toBeUndefined()
    expect(exif.GPS?.[piexif.GPSIFD.GPSLatitude]).toBeUndefined()
    expect(exif['0th']?.[piexif.ImageIFD.Make]).toBe(FIXTURE_MAKE)
    expect(exif['0th']?.[piexif.ImageIFD.Model]).toBe(FIXTURE_MODEL)
    expect(exif['0th']?.[piexif.ImageIFD.Orientation]).toBe(1)
  })

  it('removes selected camera and datetime categories while preserving unrelated EXIF', () => {
    const stripped = stripExifCategories(createExifJpegDataUrl(), ['camera', 'datetime'])
    const exif = piexif.load(stripped)

    expect(exif['0th']?.[piexif.ImageIFD.Make]).toBeUndefined()
    expect(exif['0th']?.[piexif.ImageIFD.Model]).toBeUndefined()
    expect(exif['0th']?.[piexif.ImageIFD.DateTime]).toBeUndefined()
    expect(exif['0th']?.[piexif.ImageIFD.Software]).toBe(FIXTURE_SOFTWARE)
    expect(exif['0th']?.[piexif.ImageIFD.Artist]).toBe(FIXTURE_ARTIST)
    expect(exif['0th']?.[piexif.ImageIFD.Copyright]).toBe(FIXTURE_COPYRIGHT)
    expect(exif.GPS?.[piexif.GPSIFD.GPSLatitudeRef]).toBe('N')
    expect(exif['0th']?.[piexif.ImageIFD.Orientation]).toBe(1)
  })

  it('removes all EXIF when all category is selected', () => {
    const stripped = stripExifCategories(createExifJpegDataUrl(), ['all'])
    const exif = piexif.load(stripped)

    expect(exif['0th']?.[piexif.ImageIFD.Make]).toBeUndefined()
    expect(exif['0th']?.[piexif.ImageIFD.Model]).toBeUndefined()
    expect(exif['0th']?.[piexif.ImageIFD.Orientation]).toBeUndefined()
    expect(exif['0th']?.[piexif.ImageIFD.DateTime]).toBeUndefined()
    expect(exif['0th']?.[piexif.ImageIFD.Software]).toBeUndefined()
    expect(exif['0th']?.[piexif.ImageIFD.Artist]).toBeUndefined()
    expect(exif['0th']?.[piexif.ImageIFD.Copyright]).toBeUndefined()
    expect(Object.keys(exif.GPS ?? {})).toHaveLength(0)
  })

  it('skips PNG and WEBP without invoking JPEG EXIF parsing', () => {
    expect(stripExifCategories(PNG_DATA_URL, ['all'])).toBe(PNG_DATA_URL)
    expect(stripExifCategories(WEBP_DATA_URL, ['all'])).toBe(WEBP_DATA_URL)
  })

  it('returns malformed JPEG data URLs without throwing', () => {
    expect(stripExifCategories(MALFORMED_JPEG_DATA_URL, ['all'])).toBe(MALFORMED_JPEG_DATA_URL)
  })
})
