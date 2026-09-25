import django_filters as filters

from apps.stadiums.models import FieldType, Stadium


class StadiumFilter(filters.FilterSet):
    min_price = filters.NumberFilter(field_name="price_per_hour", lookup_expr="gte")
    max_price = filters.NumberFilter(field_name="price_per_hour", lookup_expr="lte")
    min_rating = filters.NumberFilter(field_name="rating", lookup_expr="gte")
    field_type = filters.MultipleChoiceFilter(choices=FieldType.choices)
    city = filters.CharFilter(field_name="city", lookup_expr="iexact")
    district = filters.CharFilter(field_name="district", lookup_expr="icontains")
    min_capacity = filters.NumberFilter(field_name="capacity", lookup_expr="gte")
    amenities = filters.CharFilter(method="filter_amenities")

    class Meta:
        model = Stadium
        fields = ["field_type", "city", "district"]

    def filter_amenities(self, queryset, name, value):
        """`?amenities=parking,shower` — stadium must have ALL requested codes."""
        codes = [code.strip() for code in value.split(",") if code.strip()]
        for code in codes:
            queryset = queryset.filter(amenities__code=code)
        return queryset.distinct()
